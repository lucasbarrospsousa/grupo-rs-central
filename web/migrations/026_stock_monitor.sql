BEGIN;
CREATE OR REPLACE FUNCTION central_homologacao.is_monitored_stock(branch text,data jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(data->>'status'='Estoque' OR (branch<>'imperatriz' AND data->>'status'='Reserva'),false) $$;
GRANT EXECUTE ON FUNCTION central_homologacao.is_monitored_stock(text,jsonb) TO central_homologacao_web;
CREATE OR REPLACE FUNCTION central_homologacao.sync_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.sync_control; items jsonb;
BEGIN
 SELECT * INTO c FROM central_homologacao.sync_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (
 SELECT d.id,d.branch_id AS branch,d.serial,d.data->>'iccid' AS iccid,o.data->'chip' AS chip,o.data->>'chip_checked_at' AS chip_checked_at,o.data->'chip'->>'provider' AS provider,
 (o.data->>'chip_checked_at' IS NULL OR (o.data->>'chip_checked_at')::timestamptz<=now()-interval '1 hour' OR coalesce(o.data->>'monitor_iccid','')<>coalesce(d.data->>'iccid','')) AS chip_due
 FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_observations o ON o.device_id=d.id
 WHERE d.deleted_at IS NULL AND central_homologacao.is_monitored_stock(d.branch_id,d.data) AND (o.checked_at IS NULL OR o.checked_at<=now()-make_interval(mins=>c.interval_minutes))
 ORDER BY o.checked_at NULLS FIRST,d.branch_id,d.serial LIMIT 50) x;
 IF items IS NULL THEN RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true); END IF;
 IF c.next_cycle_at IS NULL OR c.next_cycle_at<=now() THEN UPDATE central_homologacao.sync_control SET cycle=cycle+1,started_at=now(),next_cycle_at=now()+make_interval(mins=>interval_minutes) WHERE id RETURNING * INTO c; END IF;
 UPDATE central_homologacao.sync_control SET lease=p_lease,lease_until=now()+interval '2 minutes',last_tick=now() WHERE id;
 RETURN jsonb_build_object('rows',items,'cycle',c.cycle);
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.sync_save(p_lease uuid,p_cycle bigint,p_id uuid,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE branch text;
BEGIN
 PERFORM 1 FROM central_homologacao.sync_control WHERE id AND enabled AND lease=p_lease AND cycle=p_cycle AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT branch_id INTO branch FROM central_homologacao.devices WHERE id=p_id AND deleted_at IS NULL AND central_homologacao.is_monitored_stock(branch_id,data);
 IF branch IS NULL THEN RETURN false; END IF;
 INSERT INTO central_homologacao.device_observations(device_id,branch_id,cycle,data,last_success) VALUES(p_id,branch,p_cycle,p_data,'{}')
 ON CONFLICT(device_id) DO UPDATE SET cycle=excluded.cycle,data=excluded.data,last_success='{}',checked_at=now();
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.sync_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('enabled',c.enabled,'scope','stock','cycle',c.cycle,'started_at',c.started_at,'last_tick',c.last_tick,'next_cycle_at',c.next_cycle_at,'interval_minutes',c.interval_minutes,
 'total',(SELECT count(*) FROM central_homologacao.devices d WHERE d.deleted_at IS NULL AND central_homologacao.is_monitored_stock(d.branch_id,d.data)),
 'completed',(SELECT count(*) FROM central_homologacao.device_observations o JOIN central_homologacao.devices d ON d.id=o.device_id WHERE d.deleted_at IS NULL AND central_homologacao.is_monitored_stock(d.branch_id,d.data) AND o.checked_at>now()-make_interval(mins=>c.interval_minutes)),
 'alerts',coalesce((SELECT jsonb_agg(jsonb_build_object('source',source,'message',message,'occurred_at',occurred_at)) FROM central_homologacao.integration_alerts WHERE blocked),'[]'::jsonb)) FROM central_homologacao.sync_control c WHERE id
$$;
CREATE OR REPLACE FUNCTION central_homologacao.configure_automation(p_enabled boolean,p_minutes integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_enabled IS NULL OR p_minutes IS NULL OR p_minutes NOT IN (5,10,15,30,1440) THEN RAISE EXCEPTION 'Invalid automation setting'; END IF;
 UPDATE central_homologacao.sync_control SET started_at=CASE WHEN p_enabled AND NOT enabled THEN now() ELSE started_at END,cycle=CASE WHEN p_enabled AND NOT enabled THEN cycle+1 ELSE cycle END,enabled=p_enabled,interval_minutes=p_minutes,next_cycle_at=now()+make_interval(mins=>p_minutes) WHERE id;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.dispatch_sync() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.sync_control; result bigint;
BEGIN
 SELECT * INTO c FROM central_homologacao.sync_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.last_dispatch_at>now()-interval '1 minute' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_observations o ON o.device_id=d.id WHERE d.deleted_at IS NULL AND central_homologacao.is_monitored_stock(d.branch_id,d.data) AND (o.checked_at IS NULL OR o.checked_at<=now()-make_interval(mins=>c.interval_minutes))) THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/sync',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=90000) INTO result;
 UPDATE central_homologacao.sync_control SET last_dispatch_at=now() WHERE id;
 RETURN result;
END $$;
-- Keep paused until the matching worker has been published and verified.
UPDATE central_homologacao.sync_control SET enabled=false,interval_minutes=15,lease=null,lease_until=null,next_cycle_at=null WHERE id;
INSERT INTO central_homologacao.migrations(version) VALUES(26);
COMMIT;
