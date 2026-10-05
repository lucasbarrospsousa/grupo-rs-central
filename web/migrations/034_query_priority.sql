BEGIN;
CREATE TABLE central_homologacao.query_policy (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), priority boolean NOT NULL DEFAULT true,
 automatic_limit integer NOT NULL DEFAULT 1 CHECK(automatic_limit BETWEEN 1 AND 2),
 resume_seconds integer NOT NULL DEFAULT 5 CHECK(resume_seconds BETWEEN 0 AND 60),
 gap_seconds integer NOT NULL DEFAULT 2 CHECK(gap_seconds BETWEEN 0 AND 60)
);
INSERT INTO central_homologacao.query_policy DEFAULT VALUES;
ALTER TABLE central_homologacao.query_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.api_v2_budget ADD COLUMN manual_until timestamptz NOT NULL DEFAULT '-infinity', ADD COLUMN automatic_at timestamptz NOT NULL DEFAULT '-infinity';
ALTER TABLE central_homologacao.api_v2_leases ADD COLUMN mode text NOT NULL DEFAULT 'page', ADD COLUMN routine text NOT NULL DEFAULT '';
CREATE TABLE central_homologacao.query_waiters(id uuid PRIMARY KEY,branch text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE central_homologacao.query_activity(branch text NOT NULL,routine text NOT NULL,reason text NOT NULL,at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(branch,routine));
ALTER TABLE central_homologacao.query_waiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.query_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON central_homologacao.query_policy,central_homologacao.query_waiters,central_homologacao.query_activity FROM PUBLIC,anon,authenticated;

CREATE FUNCTION central_homologacao.query_claim(p_branch text,p_id uuid,p_mode text,p_routine text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
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
  enabled:=CASE p_routine WHEN 'codes' THEN (SELECT c.enabled FROM code_scan_control c WHERE id) WHEN 'stock' THEN (SELECT c.enabled FROM sync_control c WHERE id) ELSE (SELECT c.enabled FROM maintenance_control c WHERE id) END;
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
CREATE OR REPLACE FUNCTION central_homologacao.api_v2_release(p_branch text,p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE released_mode text;
BEGIN
 PERFORM 1 FROM api_v2_budget WHERE branch=p_branch FOR UPDATE;
 DELETE FROM api_v2_leases WHERE branch=p_branch AND id=p_id RETURNING mode INTO released_mode;
 IF released_mode='page' THEN UPDATE api_v2_budget SET manual_until=clock_timestamp()+make_interval(secs=>(SELECT resume_seconds FROM query_policy WHERE id)) WHERE branch=p_branch; END IF;
 DELETE FROM query_waiters WHERE branch=p_branch AND id=p_id;
END $$;
CREATE FUNCTION central_homologacao.query_policy_status() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT to_jsonb(p)-'id'||jsonb_build_object('stock',(SELECT enabled FROM sync_control WHERE id),'codes',(SELECT enabled FROM code_scan_control WHERE id),'maintenance',(SELECT enabled FROM maintenance_control WHERE id),'server_at',now(),
 'branches',(SELECT jsonb_agg(jsonb_build_object('branch',b.branch,'manual_hold',b.manual_until>now(),'manual', (SELECT count(*) FROM api_v2_leases l WHERE l.branch=b.branch AND expires_at>now() AND mode='page'), 'automatic',(SELECT count(*) FROM api_v2_leases l WHERE l.branch=b.branch AND expires_at>now() AND mode='automatic'),'waiting',(SELECT count(*) FROM query_waiters w WHERE w.branch=b.branch AND expires_at>now()))) FROM api_v2_budget b),
 'activity',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM query_activity a),'[]'::jsonb)) FROM query_policy p WHERE id
$$;
CREATE FUNCTION central_homologacao.query_policy_configure(p_priority boolean,p_limit integer,p_resume integer,p_gap integer,p_stock boolean,p_codes boolean,p_maintenance boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF p_priority IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 2 OR p_resume IS NULL OR p_resume NOT BETWEEN 0 AND 60 OR p_gap IS NULL OR p_gap NOT BETWEEN 0 AND 60 OR p_stock IS NULL OR p_codes IS NULL OR p_maintenance IS NULL THEN RAISE EXCEPTION 'Invalid query policy'; END IF;
 UPDATE query_policy SET priority=p_priority,automatic_limit=p_limit,resume_seconds=p_resume,gap_seconds=p_gap WHERE id;
 UPDATE sync_control SET enabled=p_stock WHERE id;
 UPDATE code_scan_control SET enabled=p_codes WHERE id;
 UPDATE maintenance_control SET enabled=p_maintenance WHERE id;
 RETURN query_policy_status();
END $$;
REVOKE ALL ON FUNCTION central_homologacao.query_claim(text,uuid,text,text),central_homologacao.query_policy_status(),central_homologacao.query_policy_configure(boolean,integer,integer,integer,boolean,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.query_claim(text,uuid,text,text),central_homologacao.query_policy_status(),central_homologacao.query_policy_configure(boolean,integer,integer,integer,boolean,boolean,boolean) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(34);
COMMIT;
