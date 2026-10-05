BEGIN;
CREATE TABLE central_homologacao.maintenance_snapshots(branch_id text PRIMARY KEY REFERENCES central_homologacao.branches,data jsonb NOT NULL DEFAULT '{"rows":[],"count":0}',checked_at timestamptz,next_refresh timestamptz NOT NULL DEFAULT now(),warning text NOT NULL DEFAULT '');
CREATE TABLE central_homologacao.maintenance_ignition(branch_id text REFERENCES central_homologacao.branches,serial text,plate text NOT NULL,baseline text NOT NULL,active boolean NOT NULL DEFAULT true,ignition text,communication_at text,checked_at timestamptz,next_attempt timestamptz NOT NULL DEFAULT now(),warning text NOT NULL DEFAULT '',PRIMARY KEY(branch_id,serial));
CREATE TABLE central_homologacao.maintenance_control(id boolean PRIMARY KEY DEFAULT true CHECK(id),enabled boolean NOT NULL DEFAULT false,lease uuid,lease_until timestamptz,last_dispatch timestamptz);
INSERT INTO central_homologacao.maintenance_control DEFAULT VALUES;
INSERT INTO central_homologacao.maintenance_snapshots(branch_id) SELECT id FROM central_homologacao.branches WHERE id IN ('imperatriz','araguaina','acailandia','maraba');
ALTER TABLE central_homologacao.maintenance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.maintenance_ignition ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.maintenance_control ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION central_homologacao.maintenance_snapshot(p_branch text,p_data jsonb DEFAULT NULL,p_warning text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE s central_homologacao.maintenance_snapshots; result jsonb;
BEGIN
 SELECT * INTO s FROM central_homologacao.maintenance_snapshots WHERE branch_id=p_branch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Base indisponível'; END IF;
 IF p_data IS NOT NULL THEN
  IF jsonb_typeof(p_data->'rows')<>'array' OR jsonb_array_length(p_data->'rows')<>(p_data->>'count')::integer THEN RAISE EXCEPTION 'Lista incompleta'; END IF;
  UPDATE central_homologacao.maintenance_ignition SET active=false WHERE branch_id=p_branch;
  INSERT INTO central_homologacao.maintenance_ignition(branch_id,serial,plate,baseline)
  SELECT p_branch,r->>'serial',coalesce(r->>'plate',''),coalesce(r->>'updated_at','') FROM jsonb_array_elements(p_data->'rows') r WHERE r->>'serial' ~ '^\d{6,17}$' AND r->>'serial' IN (SELECT x->>'serial' FROM jsonb_array_elements(p_data->'rows') x GROUP BY x->>'serial' HAVING count(*)=1)
  ON CONFLICT(branch_id,serial) DO UPDATE SET active=true,plate=excluded.plate,baseline=excluded.baseline,
  ignition=CASE WHEN maintenance_ignition.plate=excluded.plate AND maintenance_ignition.baseline=excluded.baseline THEN maintenance_ignition.ignition ELSE NULL END,
  checked_at=CASE WHEN maintenance_ignition.plate=excluded.plate AND maintenance_ignition.baseline=excluded.baseline THEN maintenance_ignition.checked_at ELSE NULL END,
  next_attempt=CASE WHEN maintenance_ignition.plate=excluded.plate AND maintenance_ignition.baseline=excluded.baseline THEN maintenance_ignition.next_attempt ELSE now() END;
  UPDATE central_homologacao.maintenance_snapshots SET data=p_data,checked_at=now(),next_refresh=now()+interval '1 hour',warning='' WHERE branch_id=p_branch RETURNING * INTO s;
 ELSIF p_warning IS NOT NULL THEN
  UPDATE central_homologacao.maintenance_snapshots SET warning=p_warning,next_refresh=now()+interval '15 minutes' WHERE branch_id=p_branch RETURNING * INTO s;
 END IF;
 IF s.checked_at IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(r||jsonb_build_object('ignition',i.ignition,'ignition_checked_at',i.checked_at,'ignition_communication_at',i.communication_at,'ignition_warning',i.warning) ORDER BY ord),'[]') INTO result
 FROM jsonb_array_elements(s.data->'rows') WITH ORDINALITY a(r,ord) LEFT JOIN central_homologacao.maintenance_ignition i ON i.branch_id=p_branch AND i.serial=r->>'serial' AND i.plate=coalesce(r->>'plate','') AND i.baseline=coalesce(r->>'updated_at','') AND i.active;
 RETURN s.data||jsonb_build_object('rows',result,'checked_at',s.checked_at,'refresh_warning',s.warning);
END $$;

CREATE FUNCTION central_homologacao.maintenance_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.maintenance_control; jobs jsonb; base text;
BEGIN
 SELECT * INTO c FROM central_homologacao.maintenance_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() THEN RETURN '{}'::jsonb; END IF;
 SELECT branch_id INTO base FROM central_homologacao.maintenance_snapshots WHERE next_refresh<=now() ORDER BY next_refresh LIMIT 1;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO jobs FROM (SELECT branch,serial,plate,baseline FROM (SELECT branch_id AS branch,serial,plate,baseline,next_attempt,row_number() OVER(PARTITION BY branch_id ORDER BY next_attempt,serial) AS rank FROM central_homologacao.maintenance_ignition WHERE active AND next_attempt<=now()) ranked ORDER BY rank,next_attempt,branch LIMIT 8) x;
 UPDATE central_homologacao.maintenance_control SET lease=p_lease,lease_until=now()+interval '2 minutes' WHERE id;
 RETURN jsonb_build_object('branch',base,'rows',jobs);
END $$;
CREATE FUNCTION central_homologacao.maintenance_save(p_lease uuid,p_branch text,p_serial text,p_plate text,p_baseline text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 PERFORM 1 FROM central_homologacao.maintenance_control WHERE id AND enabled AND lease=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE central_homologacao.maintenance_ignition SET ignition=p_data->>'ignition',communication_at=p_data->>'communication_at',checked_at=now(),warning=coalesce(p_data->>'warning',''),next_attempt=now()+CASE WHEN p_data->>'ignition' IN ('on','off') THEN interval '24 hours' ELSE interval '1 hour' END WHERE branch_id=p_branch AND serial=p_serial AND plate=p_plate AND baseline=p_baseline AND active;
 RETURN FOUND;
END $$;
CREATE FUNCTION central_homologacao.maintenance_release(p_lease uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$ UPDATE central_homologacao.maintenance_control SET lease=NULL,lease_until=NULL WHERE id AND lease=p_lease $$;
CREATE FUNCTION central_homologacao.dispatch_maintenance() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.maintenance_control; result bigint;
BEGIN
 SELECT * INTO c FROM central_homologacao.maintenance_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.last_dispatch>now()-interval '1 minute' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM central_homologacao.maintenance_snapshots WHERE next_refresh<=now()) AND NOT EXISTS(SELECT 1 FROM central_homologacao.maintenance_ignition WHERE active AND next_attempt<=now()) THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/maintenance',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=90000) INTO result;
 UPDATE central_homologacao.maintenance_control SET last_dispatch=now() WHERE id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.maintenance_snapshot(text,jsonb,text),central_homologacao.maintenance_claim(uuid),central_homologacao.maintenance_save(uuid,text,text,text,text,jsonb),central_homologacao.maintenance_release(uuid),central_homologacao.dispatch_maintenance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.maintenance_snapshot(text,jsonb,text),central_homologacao.maintenance_claim(uuid),central_homologacao.maintenance_save(uuid,text,text,text,text,jsonb),central_homologacao.maintenance_release(uuid) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(27);
COMMIT;
