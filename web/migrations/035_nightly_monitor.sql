BEGIN;
ALTER TABLE central_homologacao.code_scan_control
 ADD COLUMN nightly_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN night_start time NOT NULL DEFAULT '22:00',
 ADD COLUMN night_end time NOT NULL DEFAULT '04:00',
 ADD COLUMN batch_limit integer NOT NULL DEFAULT 10 CHECK(batch_limit BETWEEN 1 AND 10),
 ADD COLUMN review_cycle bigint NOT NULL DEFAULT 0,
 ADD COLUMN review_started_at timestamptz,
 ADD COLUMN review_completed_at timestamptz,
 ADD CONSTRAINT code_scan_window CHECK(night_start<>night_end);
ALTER TABLE central_homologacao.device_codes ADD COLUMN review_cycle bigint NOT NULL DEFAULT 0;

-- A crossing-midnight window belongs to the date on which it starts.
CREATE FUNCTION central_homologacao.code_scan_window(p_at timestamptz,p_start time,p_end time)
 RETURNS TABLE(is_open boolean,window_start timestamptz,next_start timestamptz)
 LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH local AS (SELECT p_at AT TIME ZONE 'America/Fortaleza' AS t),
 window_bounds AS (SELECT t,CASE WHEN t::time<p_start THEN t::date-1 ELSE t::date END+p_start AS s FROM local),
 bounds AS (SELECT t,s,s::date+p_end+CASE WHEN p_end<p_start THEN interval '1 day' ELSE interval '0 day' END AS e FROM window_bounds)
 SELECT t>=s AND t<e,s AT TIME ZONE 'America/Fortaleza',
 (CASE WHEN t<e THEN s ELSE s+interval '1 day' END) AT TIME ZONE 'America/Fortaleza' FROM bounds
$$;

CREATE FUNCTION central_homologacao.code_scan_prepare() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c code_scan_control; w record;
BEGIN
 SELECT * INTO c FROM code_scan_control WHERE id FOR UPDATE;
 SELECT * INTO w FROM code_scan_window(now(),c.night_start,c.night_end);
 IF c.enabled AND c.nightly_enabled AND w.is_open AND (c.review_started_at IS NULL OR c.review_completed_at<w.window_start) THEN
  UPDATE code_scan_control SET review_cycle=review_cycle+1,review_started_at=now(),review_completed_at=NULL WHERE id;
 END IF;
END $$;

CREATE FUNCTION central_homologacao.code_scan_candidates() RETURNS TABLE(id uuid,serial text,plate text,priority integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),
 CASE WHEN r.device_id IS NULL OR r.serial<>d.serial OR r.equipment_id IS NULL THEN 0 ELSE 1 END
 FROM devices d LEFT JOIN device_codes r ON r.device_id=d.id CROSS JOIN code_scan_control c
 CROSS JOIN LATERAL code_scan_window(now(),c.night_start,c.night_end) w
 WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL AND c.id AND (
  r.device_id IS NULL OR r.serial<>d.serial OR
  (r.equipment_id IS NULL AND r.state='error' AND r.attempts<3 AND r.retry_at<=now()) OR
  (c.nightly_enabled AND w.is_open AND c.review_started_at IS NOT NULL AND c.review_completed_at IS NULL AND coalesce(r.review_cycle,0)<c.review_cycle)
 )
 ORDER BY 4,r.checked_at NULLS FIRST,d.serial
$$;

CREATE OR REPLACE FUNCTION central_homologacao.code_scan_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c code_scan_control; items jsonb; w record;
BEGIN
 SELECT * INTO c FROM code_scan_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_at>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 PERFORM code_scan_prepare();SELECT * INTO c FROM code_scan_control WHERE id;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (SELECT * FROM code_scan_candidates() LIMIT c.batch_limit) x;
 IF items IS NULL THEN
  SELECT * INTO w FROM code_scan_window(now(),c.night_start,c.night_end);
  IF c.nightly_enabled AND w.is_open AND c.review_started_at IS NOT NULL AND c.review_completed_at IS NULL THEN UPDATE code_scan_control SET review_completed_at=now() WHERE id;END IF;
  RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true);
 END IF;
 UPDATE code_scan_control SET lease=p_lease,lease_until=now()+interval '3 minutes',batch=batch+1,started_at=now(),last_tick=now(),next_at=now()+make_interval(secs=>interval_seconds),batch_ids=ARRAY(SELECT (v->>'id')::uuid FROM jsonb_array_elements(items) v) WHERE id RETURNING * INTO c;
 RETURN jsonb_build_object('rows',items,'batch',c.batch);
END $$;

ALTER FUNCTION central_homologacao.code_scan_save(uuid,uuid,text,jsonb) RENAME TO code_scan_store;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_store(uuid,uuid,text,jsonb) FROM central_homologacao_web;
CREATE FUNCTION central_homologacao.code_scan_save(p_lease uuid,p_id uuid,p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE saved boolean;
BEGIN
 -- An empty API APN never erases the last known value; record the check separately.
 IF coalesce(trim(p_data->>'apn'),'')='' THEN p_data:=p_data-'apn';END IF;
 saved:=code_scan_store(p_lease,p_id,p_serial,p_data);
 IF saved THEN
  IF p_data->>'state'<>'error' THEN UPDATE device_codes SET apn_checked_at=now() WHERE device_id=p_id;END IF;
  IF p_lease IS NOT NULL THEN UPDATE device_codes SET review_cycle=(SELECT review_cycle FROM code_scan_control WHERE id) WHERE device_id=p_id;END IF;
 END IF;
 RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION central_homologacao.dispatch_code_scan() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c code_scan_control; result bigint; w record;
BEGIN
 SELECT * INTO c FROM code_scan_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_at>now() OR c.dispatched_at>now()-interval '25 seconds' THEN RETURN NULL; END IF;
 PERFORM code_scan_prepare();
 IF NOT EXISTS(SELECT 1 FROM code_scan_candidates()) THEN
  SELECT * INTO w FROM code_scan_window(now(),c.night_start,c.night_end);
  IF c.nightly_enabled AND w.is_open THEN UPDATE code_scan_control SET review_completed_at=coalesce(review_completed_at,now()) WHERE id AND review_started_at IS NOT NULL;END IF;
  RETURN NULL;
 END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/codes',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=120000) INTO result;
 UPDATE code_scan_control SET dispatched_at=now() WHERE id;RETURN result;
END $$;

CREATE FUNCTION central_homologacao.code_scan_schedule(p_enabled boolean,p_seconds integer,p_nightly boolean,p_start time,p_end time,p_batch integer,p_priority boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_nightly IS NULL OR p_start IS NULL OR p_end IS NULL OR p_start=p_end OR p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 10 OR p_priority IS NULL THEN RAISE EXCEPTION 'Invalid schedule';END IF;
 PERFORM code_scan_configure(p_enabled,p_seconds);
 UPDATE code_scan_control SET nightly_enabled=p_nightly,night_start=p_start,night_end=p_end,batch_limit=p_batch WHERE id;
 UPDATE query_policy SET priority=p_priority WHERE id;
END $$;

ALTER FUNCTION central_homologacao.code_scan_status(text,integer) RENAME TO code_scan_summary;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_summary(text,integer) FROM central_homologacao_web;
CREATE FUNCTION central_homologacao.code_scan_status(p_state text DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT code_scan_summary(p_state,p_offset)||jsonb_build_object('window_open',w.is_open,'next_window_at',CASE WHEN c.review_completed_at>=w.window_start AND w.is_open THEN w.window_start+interval '1 day' ELSE w.next_start END,
 'review_done',(SELECT count(*) FROM devices d JOIN device_codes r ON r.device_id=d.id AND r.serial=d.serial WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL AND r.review_cycle=c.review_cycle AND c.review_cycle>0),
 'new_pending',(SELECT count(*) FROM devices d LEFT JOIN device_codes r ON r.device_id=d.id AND r.serial=d.serial WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL AND (r.device_id IS NULL OR r.equipment_id IS NULL)))
 FROM code_scan_control c CROSS JOIN LATERAL code_scan_window(now(),c.night_start,c.night_end) w WHERE c.id
$$;

-- Saved evidence only: no external HTTP, no session renewals, no device lists.
CREATE FUNCTION central_homologacao.settings_monitor() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('server_at',now(),'scan',code_scan_status()-'rows','queue',query_policy_status(),'automation',automation_status(),
 'gateway',(SELECT jsonb_build_object('ok',healthy AND checked_at>now()-interval '90 seconds','checked_at',checked_at) FROM sms_bridge_status WHERE branch_id='imperatriz'),
 'branches',(SELECT jsonb_agg(to_jsonb(x)) FROM (
  SELECT b.id,b.name,
  (SELECT count(*) FROM devices d WHERE d.branch_id=b.id AND d.deleted_at IS NULL AND is_monitored_stock(d.branch_id,d.data)) stock_total,
  (SELECT count(*) FROM devices d JOIN device_observations o ON o.device_id=d.id WHERE d.branch_id=b.id AND d.deleted_at IS NULL AND is_monitored_stock(d.branch_id,d.data) AND o.checked_at>now()-make_interval(mins=>(SELECT interval_minutes FROM sync_control WHERE id))) stock_recent,
  (SELECT max(o.checked_at) FROM devices d JOIN device_observations o ON o.device_id=d.id WHERE d.branch_id=b.id AND d.deleted_at IS NULL AND is_monitored_stock(d.branch_id,d.data)) stock_checked_at,
  m.checked_at maintenance_at,m.warning maintenance_warning,m.next_refresh
  FROM branches b LEFT JOIN maintenance_snapshots m ON m.branch_id=b.id WHERE b.id IN ('imperatriz','araguaina','acailandia','maraba') ORDER BY b.name) x),
 'sources',(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) FROM (
  SELECT sample.source,count(*)::int attempted,count(*) FILTER(WHERE sample.value->>'ok'='true' OR (sample.source='equipment' AND sample.value->>'serial'=d.serial AND coalesce(sample.value->>'ok','true')<>'false'))::int confirmed,max(o.checked_at) checked_at
  FROM device_observations o JOIN devices d ON d.id=o.device_id AND d.deleted_at IS NULL
  CROSS JOIN LATERAL (VALUES ('equipment',o.data->'equipment'),('api',o.data->'location'),('arya',CASE WHEN o.data->'chip'->>'provider'='arya' THEN o.data->'chip' END),('link',CASE WHEN o.data->'chip'->>'provider'='link' THEN o.data->'chip' END)) sample(source,value)
  WHERE o.data->>'api_version'='2' AND o.checked_at>now()-interval '24 hours' AND sample.value IS NOT NULL AND sample.value<>'null'::jsonb GROUP BY sample.source) x))
$$;

REVOKE ALL ON FUNCTION central_homologacao.code_scan_window(timestamptz,time,time),central_homologacao.code_scan_prepare(),central_homologacao.code_scan_candidates(),central_homologacao.code_scan_save(uuid,uuid,text,jsonb),central_homologacao.code_scan_status(text,integer),central_homologacao.code_scan_schedule(boolean,integer,boolean,time,time,integer,boolean),central_homologacao.settings_monitor() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_save(uuid,uuid,text,jsonb),central_homologacao.code_scan_status(text,integer),central_homologacao.code_scan_schedule(boolean,integer,boolean,time,time,integer,boolean),central_homologacao.settings_monitor() TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(35);
COMMIT;
