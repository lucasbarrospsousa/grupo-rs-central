BEGIN;
CREATE TABLE central_homologacao.code_scan_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 interval_seconds integer NOT NULL DEFAULT 25 CHECK(interval_seconds BETWEEN 25 AND 3600),
 lease uuid, lease_until timestamptz, next_at timestamptz, dispatched_at timestamptz,
 batch bigint NOT NULL DEFAULT 0, started_at timestamptz,last_tick timestamptz,last_duration_ms integer,
 batch_ids uuid[] NOT NULL DEFAULT '{}', backoff_seconds integer NOT NULL DEFAULT 0
);
INSERT INTO central_homologacao.code_scan_control(id) VALUES(true);
CREATE TABLE central_homologacao.device_codes (
 device_id uuid PRIMARY KEY REFERENCES central_homologacao.devices(id),serial text NOT NULL,
 equipment_id text,vehicle_id text,api_plate text,local_plate text,
 state text NOT NULL CHECK(state IN ('confirmed','divergent','unlinked','error')),
 checked_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 1,
 retry_at timestamptz,message text, batch bigint
);
ALTER TABLE central_homologacao.code_scan_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.device_codes ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION central_homologacao.code_scan_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.code_scan_control; items jsonb;
BEGIN
 SELECT * INTO c FROM central_homologacao.code_scan_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_at>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification','') AS plate FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_codes r ON r.device_id=d.id WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL AND (r.device_id IS NULL OR r.serial<>d.serial OR (r.state='error' AND r.attempts<3 AND r.retry_at<=now())) ORDER BY r.checked_at NULLS FIRST,d.serial LIMIT 10) x;
 IF items IS NULL THEN RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true); END IF;
 UPDATE central_homologacao.code_scan_control SET lease=p_lease,lease_until=now()+interval '3 minutes',batch=batch+1,started_at=now(),last_tick=now(),next_at=now()+make_interval(secs=>interval_seconds),batch_ids=ARRAY(SELECT (v->>'id')::uuid FROM jsonb_array_elements(items) v) WHERE id RETURNING * INTO c;
 RETURN jsonb_build_object('rows',items,'batch',c.batch);
END $$;
CREATE FUNCTION central_homologacao.code_scan_save(p_lease uuid,p_id uuid,p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.code_scan_control; d central_homologacao.devices; state text; old central_homologacao.device_codes;
BEGIN
 SELECT * INTO c FROM central_homologacao.code_scan_control WHERE id FOR UPDATE;
 IF p_lease IS NOT NULL AND (c.lease IS DISTINCT FROM p_lease OR c.lease_until<=now() OR NOT p_id=ANY(c.batch_ids)) THEN RETURN false; END IF;
 SELECT * INTO d FROM central_homologacao.devices WHERE id=p_id AND serial=p_serial AND branch_id='imperatriz' AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 state:=p_data->>'state';
 IF state NOT IN ('confirmed','divergent','unlinked','error') THEN RAISE EXCEPTION 'Invalid result'; END IF;
 IF state<>'error' AND (coalesce(p_data->>'equipment_id','')!~'^[1-9][0-9]*$' OR (state<>'unlinked' AND (coalesce(p_data->>'vehicle_id','')!~'^[1-9][0-9]*$' OR coalesce(p_data->>'api_plate','')=''))) THEN RAISE EXCEPTION 'Unconfirmed codes'; END IF;
 IF state IN ('confirmed','divergent') THEN state:=CASE WHEN regexp_replace(upper(coalesce(nullif(d.data->>'plate',''),d.data->>'identification','')),'[^A-Z0-9]','','g')=regexp_replace(upper(p_data->>'api_plate'),'[^A-Z0-9]','','g') THEN 'confirmed' ELSE 'divergent' END; END IF;
 SELECT * INTO old FROM central_homologacao.device_codes WHERE device_id=p_id;
 INSERT INTO central_homologacao.device_codes(device_id,serial,equipment_id,vehicle_id,api_plate,local_plate,state,attempts,retry_at,message,batch)
 VALUES(p_id,p_serial,CASE WHEN state='error' THEN old.equipment_id ELSE p_data->>'equipment_id' END,CASE WHEN state='error' THEN old.vehicle_id ELSE p_data->>'vehicle_id' END,CASE WHEN state='error' THEN old.api_plate ELSE p_data->>'api_plate' END,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),state,CASE WHEN old.serial=p_serial THEN coalesce(old.attempts,0)+1 ELSE 1 END,CASE WHEN state='error' THEN now()+interval '10 minutes' END,left(p_data->>'message',250),CASE WHEN p_lease IS NOT NULL THEN c.batch ELSE old.batch END)
 ON CONFLICT(device_id) DO UPDATE SET serial=excluded.serial,equipment_id=excluded.equipment_id,vehicle_id=excluded.vehicle_id,api_plate=excluded.api_plate,local_plate=excluded.local_plate,state=excluded.state,checked_at=now(),attempts=CASE WHEN excluded.state='error' THEN excluded.attempts ELSE 0 END,retry_at=excluded.retry_at,message=excluded.message,batch=excluded.batch;
 IF p_lease IS NOT NULL THEN UPDATE central_homologacao.code_scan_control SET last_tick=now(),lease_until=now()+interval '3 minutes' WHERE id; END IF;
 RETURN true;
END $$;
CREATE FUNCTION central_homologacao.code_scan_release(p_lease uuid,p_ms integer,p_backoff integer) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 UPDATE central_homologacao.code_scan_control SET lease=null,lease_until=null,last_tick=now(),last_duration_ms=p_ms,backoff_seconds=p_backoff,next_at=greatest(next_at,now()+make_interval(secs=>p_backoff)) WHERE id AND lease=p_lease
$$;
CREATE FUNCTION central_homologacao.code_scan_configure(p_enabled boolean,p_seconds integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_enabled IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 25 AND 3600 THEN RAISE EXCEPTION 'Invalid scan settings'; END IF;
 UPDATE central_homologacao.code_scan_control SET enabled=p_enabled,interval_seconds=p_seconds,next_at=CASE WHEN lease_until>now() THEN greatest(started_at+make_interval(secs=>p_seconds),next_at) ELSE greatest(now(),coalesce(started_at,now())+make_interval(secs=>p_seconds)) END WHERE id;
END $$;
CREATE FUNCTION central_homologacao.code_scan_status(p_state text DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 WITH records AS (SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification','') AS expected,r.api_plate,r.equipment_id,r.vehicle_id,r.state,r.checked_at,r.message,r.batch FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_codes r ON r.device_id=d.id AND r.serial=d.serial WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL)
 SELECT to_jsonb(c)-'lease'-'batch_ids'||jsonb_build_object('server_at',now(),'total',(SELECT count(*) FROM records),'processed',(SELECT count(*) FROM records WHERE state IS NOT NULL),'confirmed',(SELECT count(*) FROM records WHERE state='confirmed'),'divergent',(SELECT count(*) FROM records WHERE state='divergent'),'unlinked',(SELECT count(*) FROM records WHERE state='unlinked'),'errors',(SELECT count(*) FROM records WHERE state='error'),'batch_size',cardinality(c.batch_ids),'batch_done',(SELECT count(*) FROM records WHERE batch=c.batch),'detail_total',(SELECT count(*) FROM records WHERE CASE WHEN p_state IS NULL THEN id=ANY(c.batch_ids) ELSE state=p_state END),'rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM records WHERE CASE WHEN p_state IS NULL THEN id=ANY(c.batch_ids) ELSE state=p_state END ORDER BY serial LIMIT 10 OFFSET greatest(0,least(p_offset,100000))) x),'[]'::jsonb)) FROM central_homologacao.code_scan_control c WHERE id
$$;
CREATE FUNCTION central_homologacao.dispatch_code_scan() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.code_scan_control; result bigint;
BEGIN
 SELECT * INTO c FROM central_homologacao.code_scan_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_at>now() OR c.dispatched_at>now()-interval '25 seconds' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_codes r ON r.device_id=d.id WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL AND (r.device_id IS NULL OR r.serial<>d.serial OR (r.state='error' AND r.attempts<3 AND r.retry_at<=now()))) THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/codes',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=120000) INTO result;
 UPDATE central_homologacao.code_scan_control SET dispatched_at=now() WHERE id; RETURN result;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.code_scan_claim(uuid),central_homologacao.code_scan_save(uuid,uuid,text,jsonb),central_homologacao.code_scan_release(uuid,integer,integer),central_homologacao.code_scan_configure(boolean,integer),central_homologacao.code_scan_status(text,integer),central_homologacao.dispatch_code_scan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION central_homologacao.code_scan_claim(uuid),central_homologacao.code_scan_save(uuid,uuid,text,jsonb),central_homologacao.code_scan_release(uuid,integer,integer),central_homologacao.code_scan_configure(boolean,integer),central_homologacao.code_scan_status(text,integer) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(29);
COMMIT;
