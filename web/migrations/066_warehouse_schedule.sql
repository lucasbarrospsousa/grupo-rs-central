BEGIN;
CREATE OR REPLACE FUNCTION central_homologacao.query_claim(p_branch text,p_id uuid,p_mode text,p_routine text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE policy query_policy; b api_v2_budget; t timestamptz; n integer; autos integer; reason text; delay integer:=250; enabled boolean:=true;
BEGIN
 IF p_mode NOT IN ('page','automatic') OR (p_mode='automatic' AND p_routine NOT IN ('codes','stock','maintenance','warehouse')) THEN RAISE EXCEPTION 'Invalid query context'; END IF;
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
  enabled:=CASE p_routine WHEN 'warehouse' THEN true WHEN 'codes' THEN (SELECT c.enabled FROM code_scan_branches c WHERE c.branch_id=p_branch) WHEN 'stock' THEN (SELECT c.enabled FROM sync_control c WHERE id) ELSE (SELECT c.enabled FROM maintenance_control c WHERE id) END;
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
CREATE FUNCTION central_homologacao.dispatch_warehouse() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE result bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM server_power WHERE id AND state='on') THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM warehouse_link_scan WHERE due_at<=now() AND (lease_until IS NULL OR lease_until<now())) AND NOT EXISTS(SELECT 1 FROM warehouse_items WHERE kind='chip' AND status='Disponível' AND classification='Reserva' AND deleted_at IS NULL AND chip_provider IN ('arya','link') AND (chip_monitor_due IS NULL OR chip_monitor_due<=now())) THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/warehouse',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=90000) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.dispatch_warehouse() FROM PUBLIC,anon,authenticated,central_homologacao_web;
SELECT cron.schedule('central-warehouse','*/3 * * * *','select central_homologacao.dispatch_warehouse()');
INSERT INTO central_homologacao.migrations(version) VALUES(66);
COMMIT;
