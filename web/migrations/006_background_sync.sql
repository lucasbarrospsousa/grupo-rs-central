BEGIN;
CREATE TABLE central_homologacao.sync_control(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false,cycle bigint NOT NULL DEFAULT 1,started_at timestamptz DEFAULT now(),next_cycle_at timestamptz,lease uuid,lease_until timestamptz,last_tick timestamptz,interval_minutes integer NOT NULL DEFAULT 5 CHECK(interval_minutes>=5));
INSERT INTO central_homologacao.sync_control(id) VALUES(true);
CREATE TABLE central_homologacao.device_observations(device_id uuid PRIMARY KEY REFERENCES central_homologacao.devices,branch_id text NOT NULL REFERENCES central_homologacao.branches,cycle bigint NOT NULL,data jsonb NOT NULL,last_success jsonb NOT NULL DEFAULT '{}',checked_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE central_homologacao.device_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY observation_read ON central_homologacao.device_observations FOR SELECT USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=device_observations.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid));
GRANT SELECT ON central_homologacao.device_observations TO central_homologacao_web;
CREATE TABLE central_homologacao.integration_alerts(source text PRIMARY KEY,credential_fingerprint text NOT NULL,blocked boolean NOT NULL DEFAULT true,message text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION central_homologacao.sync_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.sync_control; items jsonb;
BEGIN
 SELECT * INTO c FROM central_homologacao.sync_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_cycle_at>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 IF c.next_cycle_at IS NOT NULL THEN UPDATE central_homologacao.sync_control SET cycle=cycle+1,started_at=now(),next_cycle_at=null WHERE id RETURNING * INTO c; END IF;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (SELECT d.id,d.branch_id AS branch,d.serial FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_observations o ON o.device_id=d.id WHERE d.deleted_at IS NULL AND (o.cycle IS NULL OR o.cycle<c.cycle) ORDER BY row_number() over(partition by d.branch_id order by d.serial),d.branch_id LIMIT 50) x;
 IF items IS NULL THEN UPDATE central_homologacao.sync_control SET next_cycle_at=now()+make_interval(mins=>interval_minutes),lease=null,lease_until=null,last_tick=now() WHERE id; RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true); END IF;
 UPDATE central_homologacao.sync_control SET lease=p_lease,lease_until=now()+interval '2 minutes',last_tick=now() WHERE id;
 RETURN jsonb_build_object('rows',items,'cycle',c.cycle);
END $$;
CREATE FUNCTION central_homologacao.sync_save(p_lease uuid,p_cycle bigint,p_id uuid,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE branch text; good jsonb:='{}'; k text;
BEGIN
 PERFORM 1 FROM central_homologacao.sync_control WHERE id AND lease=p_lease AND cycle=p_cycle AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT branch_id INTO branch FROM central_homologacao.devices WHERE id=p_id AND deleted_at IS NULL;IF branch IS NULL THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['equipment','location','chip'] LOOP IF p_data->k->>'ok'='true' OR (k='equipment' AND p_data->k->>'serial' IS NOT NULL AND coalesce(p_data->k->>'ok','true')='true') THEN good=good||jsonb_build_object(k,p_data->k);END IF;END LOOP;
 INSERT INTO central_homologacao.device_observations(device_id,branch_id,cycle,data,last_success) VALUES(p_id,branch,p_cycle,p_data,good) ON CONFLICT(device_id) DO UPDATE SET cycle=excluded.cycle,data=excluded.data,last_success=device_observations.last_success||excluded.last_success,checked_at=now();RETURN true;
END $$;
CREATE FUNCTION central_homologacao.sync_release(p_lease uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$UPDATE central_homologacao.sync_control SET lease=null,lease_until=null,last_tick=now() WHERE id AND lease=p_lease$$;
CREATE FUNCTION central_homologacao.sync_auth_state(p_source text,p_fingerprint text,p_message text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_message IS NOT NULL THEN INSERT INTO central_homologacao.integration_alerts(source,credential_fingerprint,message) VALUES(p_source,p_fingerprint,p_message) ON CONFLICT(source) DO UPDATE SET credential_fingerprint=excluded.credential_fingerprint,message=excluded.message,blocked=true,occurred_at=now();END IF;
 UPDATE central_homologacao.integration_alerts SET blocked=false WHERE source=p_source AND credential_fingerprint<>p_fingerprint;
 RETURN EXISTS(SELECT 1 FROM central_homologacao.integration_alerts WHERE source=p_source AND blocked);
END $$;
CREATE FUNCTION central_homologacao.sync_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('enabled',c.enabled,'cycle',c.cycle,'started_at',c.started_at,'last_tick',c.last_tick,'next_cycle_at',c.next_cycle_at,'interval_minutes',c.interval_minutes,'total',(SELECT count(*) FROM central_homologacao.devices WHERE deleted_at IS NULL),'completed',(SELECT count(*) FROM central_homologacao.device_observations o JOIN central_homologacao.devices d ON d.id=o.device_id WHERE o.cycle=c.cycle AND d.deleted_at IS NULL),'alerts',coalesce((SELECT jsonb_agg(jsonb_build_object('source',source,'message',message,'occurred_at',occurred_at)) FROM central_homologacao.integration_alerts WHERE blocked),'[]'::jsonb)) FROM central_homologacao.sync_control c WHERE id
$$;
REVOKE ALL ON FUNCTION central_homologacao.sync_claim(uuid),central_homologacao.sync_save(uuid,bigint,uuid,jsonb),central_homologacao.sync_release(uuid),central_homologacao.sync_auth_state(text,text,text),central_homologacao.sync_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.sync_claim(uuid),central_homologacao.sync_save(uuid,bigint,uuid,jsonb),central_homologacao.sync_release(uuid),central_homologacao.sync_auth_state(text,text,text),central_homologacao.sync_status() TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(6);
COMMIT;
