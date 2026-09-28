BEGIN;
ALTER TABLE central_homologacao.sync_control ADD COLUMN usage_started_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN last_dispatch_at timestamptz;
CREATE TABLE central_homologacao.query_usage(day date NOT NULL, source text NOT NULL CHECK(source IN ('api','portal','arya','link','other')), mode text NOT NULL CHECK(mode IN ('automatic','page')), total bigint NOT NULL CHECK(total>=0), failed bigint NOT NULL CHECK(failed>=0 AND failed<=total), PRIMARY KEY(day,source,mode));
ALTER TABLE central_homologacao.query_usage ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION central_homologacao.record_query_usage(p_mode text,p_rows jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 INSERT INTO central_homologacao.query_usage(day,source,mode,total,failed)
 SELECT (now() AT TIME ZONE 'UTC')::date,source,p_mode,total,failed FROM jsonb_to_recordset(p_rows) AS x(source text,total bigint,failed bigint)
 ON CONFLICT(day,source,mode) DO UPDATE SET total=query_usage.total+excluded.total,failed=query_usage.failed+excluded.failed;
 DELETE FROM central_homologacao.query_usage WHERE day<(now() AT TIME ZONE 'UTC')::date-29;
END $$;
CREATE FUNCTION central_homologacao.configure_automation(p_enabled boolean,p_minutes integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_enabled IS NULL OR p_minutes IS NULL OR p_minutes NOT IN (5,10,30,1440) THEN RAISE EXCEPTION 'Invalid automation setting';END IF;
 UPDATE central_homologacao.sync_control SET enabled=p_enabled,interval_minutes=p_minutes,next_cycle_at=CASE WHEN next_cycle_at IS NOT NULL THEN coalesce(last_tick,now())+make_interval(mins=>p_minutes) ELSE NULL END WHERE id;
END $$;
CREATE FUNCTION central_homologacao.automation_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('sync',central_homologacao.sync_status(),'tracking_since',c.usage_started_at,'usage',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT source,mode,sum(total) AS total,sum(failed) AS failed FROM central_homologacao.query_usage WHERE day>=(now() AT TIME ZONE 'UTC')::date-29 GROUP BY source,mode) x),'[]'::jsonb)) FROM central_homologacao.sync_control c WHERE id
$$;
CREATE OR REPLACE FUNCTION central_homologacao.sync_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.sync_control; items jsonb;
BEGIN
 SELECT * INTO c FROM central_homologacao.sync_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_cycle_at>now() OR c.last_tick+make_interval(mins=>c.interval_minutes)>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 IF c.next_cycle_at IS NOT NULL THEN UPDATE central_homologacao.sync_control SET cycle=cycle+1,started_at=now(),next_cycle_at=null WHERE id RETURNING * INTO c; END IF;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (SELECT d.id,d.branch_id AS branch,d.serial FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_observations o ON o.device_id=d.id WHERE d.deleted_at IS NULL AND (o.cycle IS NULL OR o.cycle<c.cycle) ORDER BY row_number() over(partition by d.branch_id order by d.serial),d.branch_id LIMIT 50) x;
 IF items IS NULL THEN UPDATE central_homologacao.sync_control SET next_cycle_at=now()+make_interval(mins=>interval_minutes),lease=null,lease_until=null,last_tick=now() WHERE id; RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true); END IF;
 UPDATE central_homologacao.sync_control SET lease=p_lease,lease_until=now()+interval '2 minutes',last_tick=now() WHERE id;
 RETURN jsonb_build_object('rows',items,'cycle',c.cycle);
END $$;

CREATE OR REPLACE FUNCTION central_homologacao.dispatch_sync() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.sync_control; result bigint;
BEGIN
 SELECT * INTO c FROM central_homologacao.sync_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_cycle_at>now() OR c.last_tick+make_interval(mins=>c.interval_minutes)>now() OR c.last_dispatch_at+make_interval(mins=>c.interval_minutes)>now() THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/sync',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=90000) INTO result;
 UPDATE central_homologacao.sync_control SET last_dispatch_at=now() WHERE id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.dispatch_sync() FROM PUBLIC,anon,authenticated,central_homologacao_web;
REVOKE ALL ON FUNCTION central_homologacao.record_query_usage(text,jsonb),central_homologacao.configure_automation(boolean,integer),central_homologacao.automation_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.record_query_usage(text,jsonb),central_homologacao.configure_automation(boolean,integer),central_homologacao.automation_status() TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(19);
COMMIT;
