BEGIN;
-- Independent leases, intervals and review cycles; preserve Imperatriz progress.
CREATE TABLE central_homologacao.code_scan_branches (LIKE central_homologacao.code_scan_control INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE central_homologacao.code_scan_branches ADD COLUMN branch_id text PRIMARY KEY REFERENCES central_homologacao.branches(id);
INSERT INTO central_homologacao.code_scan_branches SELECT c.*,'imperatriz' FROM central_homologacao.code_scan_control c;
INSERT INTO central_homologacao.code_scan_branches(branch_id,enabled,interval_seconds,nightly_enabled,night_start,night_end,batch_limit)
 SELECT b.id,c.enabled,c.interval_seconds,c.nightly_enabled,c.night_start,c.night_end,c.batch_limit FROM central_homologacao.branches b CROSS JOIN central_homologacao.code_scan_control c WHERE b.id IN ('araguaina','acailandia','maraba');
ALTER TABLE central_homologacao.code_scan_branches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON central_homologacao.code_scan_branches FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_prepare(p_branch text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c code_scan_branches; w record;
BEGIN
 SELECT * INTO c FROM code_scan_branches WHERE branch_id=p_branch FOR UPDATE;
 SELECT * INTO w FROM code_scan_window(now(),c.night_start,c.night_end);
 IF c.enabled AND c.nightly_enabled AND w.is_open AND (c.review_started_at IS NULL OR c.review_completed_at<w.window_start) THEN
  UPDATE code_scan_branches SET review_cycle=review_cycle+1,review_started_at=now(),review_completed_at=NULL WHERE branch_id=p_branch;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_candidates(p_branch text) RETURNS TABLE(id uuid,serial text,plate text,priority integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),
 CASE WHEN r.device_id IS NULL OR r.serial<>d.serial OR r.equipment_id IS NULL THEN 0 ELSE 1 END
 FROM devices d LEFT JOIN device_codes r ON r.device_id=d.id CROSS JOIN code_scan_branches c
 CROSS JOIN LATERAL code_scan_window(now(),c.night_start,c.night_end) w
 WHERE d.branch_id=p_branch AND d.deleted_at IS NULL AND c.branch_id=p_branch AND (
  r.device_id IS NULL OR r.serial<>d.serial OR
  (r.equipment_id IS NULL AND r.state='error' AND r.attempts<3 AND r.retry_at<=now()) OR
  (c.nightly_enabled AND w.is_open AND c.review_started_at IS NOT NULL AND c.review_completed_at IS NULL AND coalesce(r.review_cycle,0)<c.review_cycle)
 )
 ORDER BY 4,r.checked_at NULLS FIRST,d.serial
$$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_claim(p_branch text,p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c code_scan_branches; items jsonb; w record;
BEGIN
 SELECT * INTO c FROM code_scan_branches WHERE branch_id=p_branch FOR UPDATE;
 IF NOT FOUND OR NOT c.enabled OR c.lease_until>now() OR c.next_at>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 PERFORM code_scan_prepare(p_branch);SELECT * INTO c FROM code_scan_branches WHERE branch_id=p_branch;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (SELECT * FROM code_scan_candidates(p_branch) LIMIT c.batch_limit) x;
 IF items IS NULL THEN
  SELECT * INTO w FROM code_scan_window(now(),c.night_start,c.night_end);
  IF c.nightly_enabled AND w.is_open AND c.review_started_at IS NOT NULL AND c.review_completed_at IS NULL THEN UPDATE code_scan_branches SET review_completed_at=now() WHERE branch_id=p_branch;END IF;
  RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true);
 END IF;
 UPDATE code_scan_branches SET lease=p_lease,lease_until=now()+interval '3 minutes',batch=batch+1,started_at=now(),last_tick=now(),next_at=now()+make_interval(secs=>interval_seconds),batch_ids=ARRAY(SELECT (v->>'id')::uuid FROM jsonb_array_elements(items) v) WHERE branch_id=p_branch RETURNING * INTO c;
 RETURN jsonb_build_object('rows',items,'batch',c.batch);
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_store(p_lease uuid,p_id uuid,p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.code_scan_branches; d central_homologacao.devices; state text; old central_homologacao.device_codes; p_branch text;
BEGIN
 SELECT branch_id INTO p_branch FROM devices WHERE id=p_id AND serial=p_serial AND deleted_at IS NULL;
 IF p_branch IS NULL THEN RETURN false; END IF;
 SELECT * INTO c FROM central_homologacao.code_scan_branches WHERE branch_id=p_branch FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_lease IS NOT NULL AND (c.lease IS DISTINCT FROM p_lease OR coalesce(c.lease_until<=now(),true) OR NOT p_id=ANY(c.batch_ids)) THEN RETURN false; END IF;
 SELECT * INTO d FROM central_homologacao.devices WHERE id=p_id AND serial=p_serial AND branch_id=p_branch AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 state:=p_data->>'state';
 IF state NOT IN ('confirmed','divergent','unlinked','error') THEN RAISE EXCEPTION 'Invalid result'; END IF;
 IF state<>'error' AND (coalesce(p_data->>'equipment_id','')!~'^[1-9][0-9]*$' OR (state<>'unlinked' AND (coalesce(p_data->>'vehicle_id','')!~'^[1-9][0-9]*$' OR coalesce(p_data->>'api_plate','')=''))) THEN RAISE EXCEPTION 'Unconfirmed codes'; END IF;
 IF state IN ('confirmed','divergent') THEN state:=CASE WHEN regexp_replace(upper(coalesce(nullif(d.data->>'plate',''),d.data->>'identification','')),'[^A-Z0-9]','','g')=regexp_replace(upper(p_data->>'api_plate'),'[^A-Z0-9]','','g') THEN 'confirmed' ELSE 'divergent' END; END IF;
 SELECT * INTO old FROM central_homologacao.device_codes WHERE device_id=p_id AND serial=p_serial;
 INSERT INTO central_homologacao.device_codes(device_id,serial,equipment_id,vehicle_id,api_plate,local_plate,state,attempts,retry_at,message,batch)
 VALUES(p_id,p_serial,CASE WHEN state='error' THEN old.equipment_id ELSE p_data->>'equipment_id' END,CASE WHEN state='error' THEN old.vehicle_id ELSE p_data->>'vehicle_id' END,CASE WHEN state='error' THEN old.api_plate ELSE p_data->>'api_plate' END,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),state,CASE WHEN old.serial=p_serial THEN coalesce(old.attempts,0)+1 ELSE 1 END,CASE WHEN state='error' THEN now()+interval '10 minutes' END,left(p_data->>'message',250),CASE WHEN p_lease IS NOT NULL THEN c.batch ELSE old.batch END)
 ON CONFLICT(device_id) DO UPDATE SET serial=excluded.serial,equipment_id=excluded.equipment_id,vehicle_id=excluded.vehicle_id,api_plate=excluded.api_plate,local_plate=excluded.local_plate,state=excluded.state,checked_at=now(),attempts=CASE WHEN excluded.state='error' THEN excluded.attempts ELSE 0 END,retry_at=excluded.retry_at,message=excluded.message,batch=excluded.batch;
 IF state<>'error' AND p_data ? 'apn' THEN
  UPDATE central_homologacao.device_codes SET apn=nullif(left(trim(p_data->>'apn'),200),''),apn_iccid=nullif(p_data->>'iccid',''),apn_checked_at=now() WHERE device_id=p_id;
  -- An APN is applied only to the exact SIM still attached to this device.
  UPDATE central_homologacao.devices SET data=jsonb_set(data,'{apn}',to_jsonb(lower(trim(p_data->>'apn')))),version=version+1,updated_at=now()
  WHERE id=p_id AND serial=p_serial AND deleted_at IS NULL
    AND coalesce(p_data->>'apn','')<>'' AND length(p_data->>'apn')<=200
    AND coalesce(p_data->>'iccid','') ~ '^89[0-9]{17,18}$' AND data->>'iccid'=p_data->>'iccid'
    AND data->>'apn' IS DISTINCT FROM lower(trim(p_data->>'apn'));
 END IF;
 IF p_lease IS NOT NULL THEN UPDATE central_homologacao.code_scan_branches SET last_tick=now(),lease_until=now()+interval '3 minutes' WHERE branch_id=p_branch; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_save(p_lease uuid,p_id uuid,p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE saved boolean;
BEGIN
 -- An empty API APN never erases the last known value; record the check separately.
 IF coalesce(trim(p_data->>'apn'),'')='' THEN p_data:=p_data-'apn';END IF;
 saved:=code_scan_store(p_lease,p_id,p_serial,p_data);
 IF saved THEN
  IF p_data->>'state'<>'error' THEN UPDATE device_codes SET apn_checked_at=now() WHERE device_id=p_id;END IF;
  IF p_lease IS NOT NULL THEN UPDATE device_codes SET review_cycle=(SELECT c.review_cycle FROM code_scan_branches c JOIN devices d ON d.branch_id=c.branch_id WHERE d.id=p_id) WHERE device_id=p_id;END IF;
 END IF;
 RETURN saved;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_release(p_lease uuid,p_ms integer,p_backoff integer) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 UPDATE central_homologacao.code_scan_branches SET lease=null,lease_until=null,last_tick=now(),last_duration_ms=p_ms,backoff_seconds=p_backoff,next_at=greatest(next_at,now()+make_interval(secs=>p_backoff)) WHERE lease=p_lease
$$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_configure(p_branch text,p_enabled boolean,p_seconds integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_enabled IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 25 AND 3600 THEN RAISE EXCEPTION 'Invalid scan settings'; END IF;
 UPDATE central_homologacao.code_scan_branches SET enabled=p_enabled,interval_seconds=p_seconds,next_at=CASE WHEN lease_until>now() THEN greatest(started_at+make_interval(secs=>p_seconds),next_at) ELSE greatest(now(),coalesce(started_at,now())+make_interval(secs=>p_seconds)) END WHERE branch_id=p_branch;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_schedule(p_branch text,p_enabled boolean,p_seconds integer,p_nightly boolean,p_start time,p_end time,p_batch integer,p_priority boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_nightly IS NULL OR p_start IS NULL OR p_end IS NULL OR p_start=p_end OR p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 10 OR p_priority IS NULL THEN RAISE EXCEPTION 'Invalid schedule';END IF;
 PERFORM code_scan_configure(p_branch,p_enabled,p_seconds);
 UPDATE code_scan_branches SET nightly_enabled=p_nightly,night_start=p_start,night_end=p_end,batch_limit=p_batch WHERE branch_id=p_branch;
 UPDATE query_policy SET priority=p_priority WHERE id;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_summary(p_branch text,p_state text,p_offset integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 WITH records AS (SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification','') AS expected,r.api_plate,r.equipment_id,r.vehicle_id,r.state,r.checked_at,r.message,r.batch,coalesce(nullif(d.data->>'apn',''),r.apn) AS apn,r.apn_checked_at,r.review_cycle FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_codes r ON r.device_id=d.id AND r.serial=d.serial WHERE d.branch_id=p_branch AND d.deleted_at IS NULL)
 SELECT to_jsonb(c)-'lease'-'batch_ids'||jsonb_build_object('server_at',now(),'apn_saved',(SELECT count(*) FROM records WHERE coalesce(trim(apn),'')<>''),'apn_pending',(SELECT count(*) FROM records WHERE coalesce(trim(apn),'')='' AND apn_checked_at IS NULL),'total',(SELECT count(*) FROM records),'processed',(SELECT count(*) FROM records WHERE state IS NOT NULL),'confirmed',(SELECT count(*) FROM records WHERE state='confirmed'),'divergent',(SELECT count(*) FROM records WHERE state='divergent'),'unlinked',(SELECT count(*) FROM records WHERE state='unlinked'),'errors',(SELECT count(*) FROM records WHERE state='error'),'batch_size',cardinality(c.batch_ids),'batch_done',(SELECT count(*) FROM records WHERE batch=c.batch),'detail_total',(SELECT count(*) FROM records WHERE CASE WHEN p_state IS NULL THEN id=ANY(c.batch_ids) ELSE state=p_state END),'rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM records WHERE CASE WHEN p_state IS NULL THEN id=ANY(c.batch_ids) ELSE state=p_state END ORDER BY serial LIMIT 10 OFFSET greatest(0,least(p_offset,100000))) x),'[]'::jsonb)) FROM central_homologacao.code_scan_branches c WHERE branch_id=p_branch
$$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_status(p_branch text,p_state text DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT code_scan_summary(p_branch,p_state,p_offset)||jsonb_build_object('window_open',w.is_open,'next_window_at',CASE WHEN c.review_completed_at>=w.window_start AND w.is_open THEN w.window_start+interval '1 day' ELSE w.next_start END,
 'review_done',(SELECT count(*) FROM devices d JOIN device_codes r ON r.device_id=d.id AND r.serial=d.serial WHERE d.branch_id=p_branch AND d.deleted_at IS NULL AND r.review_cycle=c.review_cycle AND c.review_cycle>0),
 'new_pending',(SELECT count(*) FROM devices d LEFT JOIN device_codes r ON r.device_id=d.id AND r.serial=d.serial WHERE d.branch_id=p_branch AND d.deleted_at IS NULL AND (r.device_id IS NULL OR r.equipment_id IS NULL)))
 FROM code_scan_branches c CROSS JOIN LATERAL code_scan_window(now(),c.night_start,c.night_end) w WHERE c.branch_id=p_branch
$$;
CREATE OR REPLACE FUNCTION central_homologacao.dispatch_code_scan(p_branch text) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c code_scan_branches; result bigint; w record;
BEGIN
 SELECT * INTO c FROM code_scan_branches WHERE branch_id=p_branch FOR UPDATE;
 IF NOT FOUND OR NOT c.enabled OR c.lease_until>now() OR c.next_at>now() OR c.dispatched_at>now()-interval '25 seconds' THEN RETURN NULL; END IF;
 PERFORM code_scan_prepare(p_branch);
 IF NOT EXISTS(SELECT 1 FROM code_scan_candidates(p_branch)) THEN
  SELECT * INTO w FROM code_scan_window(now(),c.night_start,c.night_end);
  IF c.nightly_enabled AND w.is_open THEN UPDATE code_scan_branches SET review_completed_at=coalesce(review_completed_at,now()) WHERE branch_id=p_branch AND review_started_at IS NOT NULL;END IF;
  RETURN NULL;
 END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/codes',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:=jsonb_build_object('branch',p_branch),timeout_milliseconds:=120000) INTO result;
 UPDATE code_scan_branches SET dispatched_at=now() WHERE branch_id=p_branch;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.dispatch_code_scan() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE b text; result bigint;
BEGIN
 FOR b IN SELECT branch_id FROM code_scan_branches ORDER BY branch_id LOOP result:=dispatch_code_scan(b); END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.capture_device_codes(p_branch text,p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE device uuid;
BEGIN
 SELECT id INTO device FROM central_homologacao.devices WHERE branch_id=p_branch AND serial=p_serial AND deleted_at IS NULL;
 IF device IS NULL THEN RETURN false; END IF;
 RETURN central_homologacao.code_scan_save(null,device,p_serial,p_data);
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.location_device_codes(p_branch text,p_serial text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('vehicle_id',c.vehicle_id,'equipment_id',c.equipment_id)
 FROM central_homologacao.device_codes c JOIN central_homologacao.devices d ON d.id=c.device_id AND d.serial=c.serial
 WHERE d.branch_id=p_branch AND d.serial=p_serial AND d.deleted_at IS NULL
 AND c.state IN ('confirmed','divergent') AND c.vehicle_id ~ '^[1-9][0-9]*$' AND c.equipment_id ~ '^[1-9][0-9]*$'
$$;
CREATE OR REPLACE FUNCTION central_homologacao.query_claim(p_branch text,p_id uuid,p_mode text,p_routine text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE policy query_policy; b api_v2_budget; t timestamptz; n integer; autos integer; reason text; delay integer:=250; enabled boolean:=true;
BEGIN
 IF p_mode NOT IN ('page','automatic') OR (p_mode='automatic' AND p_routine NOT IN ('codes','stock','maintenance')) THEN RAISE EXCEPTION 'Invalid query context'; END IF;
 INSERT INTO api_v2_budget(branch) VALUES(p_branch) ON CONFLICT DO NOTHING;
 SELECT * INTO b FROM api_v2_budget WHERE branch=p_branch FOR UPDATE;
 SELECT * INTO policy FROM query_policy WHERE id;
 t:=clock_timestamp();
 DELETE FROM api_v2_leases WHERE branch=p_branch AND expires_at<=t;
 DELETE FROM query_waiters WHERE branch=p_branch AND expires_at<=t;
 SELECT count(*),count(*) FILTER(WHERE mode='automatic') INTO n,autos FROM api_v2_leases WHERE branch=p_branch;
 IF p_mode='page' THEN
  INSERT INTO query_waiters VALUES(p_id,p_branch,t+interval '20 seconds') ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at;
  UPDATE api_v2_budget SET manual_until=t+make_interval(secs=>policy.resume_seconds) WHERE branch=p_branch;
 ELSE
  enabled:=CASE p_routine WHEN 'codes' THEN (SELECT c.enabled FROM code_scan_branches c WHERE c.branch_id=p_branch) WHEN 'stock' THEN (SELECT c.enabled FROM sync_control c WHERE id) ELSE (SELECT c.enabled FROM maintenance_control c WHERE id) END;
  IF NOT coalesce(enabled,false) THEN reason:='paused';
  ELSIF policy.priority AND (b.manual_until>t OR EXISTS(SELECT 1 FROM query_waiters WHERE branch=p_branch) OR n>autos) THEN reason:='manual';
  ELSIF autos>=policy.automatic_limit THEN reason:='capacity';
  ELSIF b.automatic_at>t THEN reason:='interval';delay:=greatest(250,ceil(extract(epoch FROM b.automatic_at-t)*1000)::integer);
  END IF;
 END IF;
 IF reason IS NULL THEN
  IF n>=2 THEN reason:='capacity';
  ELSIF b.next_at>t THEN reason:='interval';delay:=greatest(50,ceil(extract(epoch FROM b.next_at-t)*1000)::integer);
  END IF;
 END IF;
 IF reason IS NOT NULL THEN
  IF p_mode='automatic' THEN INSERT INTO query_activity VALUES(p_branch,p_routine,reason,t) ON CONFLICT(branch,routine) DO UPDATE SET reason=excluded.reason,at=excluded.at; END IF;
  RETURN jsonb_build_object('wait_ms',delay,'reason',reason);
 END IF;
 DELETE FROM query_waiters WHERE id=p_id;
 INSERT INTO api_v2_leases(id,branch,expires_at,mode,routine) VALUES(p_id,p_branch,t+interval '25 seconds',p_mode,p_routine);
 UPDATE api_v2_budget SET next_at=t+interval '1100 milliseconds',automatic_at=CASE WHEN p_mode='automatic' THEN t+make_interval(secs=>policy.gap_seconds) ELSE automatic_at END WHERE branch=p_branch;
 IF p_mode='automatic' THEN INSERT INTO query_activity VALUES(p_branch,p_routine,'running',t) ON CONFLICT(branch,routine) DO UPDATE SET reason=excluded.reason,at=excluded.at; END IF;
 RETURN jsonb_build_object('wait_ms',0,'reason','running');
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.query_policy_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT to_jsonb(p)-'id'||jsonb_build_object('stock',(SELECT enabled FROM sync_control WHERE id),'codes',(SELECT bool_or(enabled) FROM code_scan_branches),'maintenance',(SELECT enabled FROM maintenance_control WHERE id),'server_at',now(),
 'branches',(SELECT jsonb_agg(jsonb_build_object('branch',b.branch,'manual_hold',b.manual_until>now(),'manual', (SELECT count(*) FROM api_v2_leases l WHERE l.branch=b.branch AND expires_at>now() AND mode='page'), 'automatic',(SELECT count(*) FROM api_v2_leases l WHERE l.branch=b.branch AND expires_at>now() AND mode='automatic'),'waiting',(SELECT count(*) FROM query_waiters w WHERE w.branch=b.branch AND expires_at>now()))) FROM api_v2_budget b),
 'activity',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM query_activity a),'[]'::jsonb)) FROM query_policy p WHERE id
$$;
CREATE OR REPLACE FUNCTION central_homologacao.query_policy_configure(p_priority boolean,p_limit integer,p_resume integer,p_gap integer,p_stock boolean,p_codes boolean,p_maintenance boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_priority IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 2 OR p_resume IS NULL OR p_resume NOT BETWEEN 0 AND 60 OR p_gap IS NULL OR p_gap NOT BETWEEN 0 AND 60 OR p_stock IS NULL OR p_codes IS NULL OR p_maintenance IS NULL THEN RAISE EXCEPTION 'Invalid query policy'; END IF;
 UPDATE query_policy SET priority=p_priority,automatic_limit=p_limit,resume_seconds=p_resume,gap_seconds=p_gap WHERE id;
 UPDATE sync_control SET enabled=p_stock WHERE id;
 UPDATE code_scan_control SET enabled=p_codes WHERE id;
 IF p_codes IS DISTINCT FROM (SELECT bool_or(enabled) FROM code_scan_branches) THEN UPDATE code_scan_branches SET enabled=p_codes; END IF;
 UPDATE maintenance_control SET enabled=p_maintenance WHERE id;
 RETURN query_policy_status();
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_claim(p_lease uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$ SELECT code_scan_claim('imperatriz',p_lease) $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_status(p_state text DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$ SELECT code_scan_status('imperatriz',p_state,p_offset) $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_configure(p_enabled boolean,p_seconds integer) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$ SELECT code_scan_configure('imperatriz',p_enabled,p_seconds) $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_schedule(p_enabled boolean,p_seconds integer,p_nightly boolean,p_start time,p_end time,p_batch integer,p_priority boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$ SELECT code_scan_schedule('imperatriz',p_enabled,p_seconds,p_nightly,p_start,p_end,p_batch,p_priority) $$;
CREATE OR REPLACE FUNCTION central_homologacao.capture_device_codes(p_serial text,p_data jsonb) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$ SELECT capture_device_codes('imperatriz',p_serial,p_data) $$;
CREATE OR REPLACE FUNCTION central_homologacao.settings_monitor() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('server_at',now(),'scan',code_scan_status('imperatriz',NULL,0)-'rows','scans',(SELECT jsonb_agg(code_scan_status(branch_id,NULL,0)-'rows' ORDER BY branch_id) FROM code_scan_branches),'queue',query_policy_status(),'automation',automation_status(),
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
REVOKE ALL ON FUNCTION central_homologacao.code_scan_prepare(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_candidates(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_claim(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_claim(text,uuid) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_store(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_save(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_save(uuid,uuid,text,jsonb) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_release(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_release(uuid,integer,integer) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_configure(text,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_configure(text,boolean,integer) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_schedule(text,boolean,integer,boolean,time,time,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_schedule(text,boolean,integer,boolean,time,time,integer,boolean) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_summary(text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_status(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_status(text,text,integer) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.dispatch_code_scan(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION central_homologacao.dispatch_code_scan() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION central_homologacao.capture_device_codes(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.capture_device_codes(text,text,jsonb) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.location_device_codes(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.location_device_codes(text,text) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.query_claim(text,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.query_claim(text,uuid,text,text) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.query_policy_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.query_policy_status() TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.query_policy_configure(boolean,integer,integer,integer,boolean,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.query_policy_configure(boolean,integer,integer,integer,boolean,boolean,boolean) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_claim(uuid) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_status(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_status(text,integer) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_configure(boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_configure(boolean,integer) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_schedule(boolean,integer,boolean,time,time,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_schedule(boolean,integer,boolean,time,time,integer,boolean) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.capture_device_codes(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.capture_device_codes(text,jsonb) TO central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.settings_monitor() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.settings_monitor() TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(36);
COMMIT;
