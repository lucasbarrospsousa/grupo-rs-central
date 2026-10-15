BEGIN;
CREATE TABLE IF NOT EXISTS central_homologacao.server_power (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), state text NOT NULL DEFAULT 'on' CHECK(state IN ('on','stopping','off')),
 updated_at timestamptz NOT NULL DEFAULT now(), saved_jobs jsonb NOT NULL DEFAULT '[]'
);
INSERT INTO central_homologacao.server_power(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS central_homologacao.server_power_requests(id uuid PRIMARY KEY, expires_at timestamptz NOT NULL);
REVOKE ALL ON central_homologacao.server_power,central_homologacao.server_power_requests FROM PUBLIC,anon,authenticated,central_homologacao_web;
CREATE OR REPLACE FUNCTION central_homologacao.server_power_gate(p_action text,p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE s text; n integer;
BEGIN
 SELECT state INTO s FROM server_power WHERE id FOR UPDATE;
 DELETE FROM server_power_requests WHERE expires_at<=now();
 IF p_action='enter' AND s='on' THEN
  IF p_id IS NULL THEN RAISE EXCEPTION 'Request required'; END IF;
  INSERT INTO server_power_requests VALUES(p_id,now()+interval '15 minutes');
 ELSIF p_action='leave' THEN DELETE FROM server_power_requests WHERE id=p_id;
 ELSIF p_action NOT IN ('status','enter') THEN RAISE EXCEPTION 'Invalid action'; END IF;
 SELECT count(*) INTO n FROM server_power_requests;
 IF s='stopping' AND n=0 THEN s:='off';UPDATE server_power SET state=s,updated_at=now() WHERE id;END IF;
 RETURN jsonb_build_object('state',s,'active',n,'allowed',p_action='enter' AND s='on');
END $$;
CREATE OR REPLACE FUNCTION public.central_server_power(operation text DEFAULT 'status') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE s text; j record;
BEGIN
 SELECT state INTO s FROM server_power WHERE id FOR UPDATE;
 IF operation='off' AND s='on' THEN
  UPDATE server_power SET state='stopping',updated_at=now(),saved_jobs=(SELECT coalesce(jsonb_agg(jsonb_build_object('jobid',jobid,'active',active)),'[]') FROM cron.job WHERE jobname IN ('central-background-sync','central-device-codes','central-maintenance-ignition')) WHERE id;
  FOR j IN SELECT jobid FROM cron.job WHERE jobname IN ('central-background-sync','central-device-codes','central-maintenance-ignition') LOOP PERFORM cron.alter_job(j.jobid,active:=false);END LOOP;
 ELSIF operation='on' AND s='stopping' THEN RAISE EXCEPTION 'Wait for active work';
 ELSIF operation='on' AND s='off' THEN
  FOR j IN SELECT * FROM jsonb_to_recordset((SELECT saved_jobs FROM server_power WHERE id)) AS x(jobid bigint,active boolean) LOOP
   IF EXISTS(SELECT FROM cron.job WHERE jobid=j.jobid AND jobname IN ('central-background-sync','central-device-codes','central-maintenance-ignition')) THEN PERFORM cron.alter_job(j.jobid,active:=j.active);END IF;
  END LOOP;
  UPDATE server_power SET state='on',updated_at=now(),saved_jobs='[]' WHERE id;
 ELSIF operation NOT IN ('status','on','off') THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 RETURN server_power_gate('status')||jsonb_build_object('configured',true);
END $$;
REVOKE ALL ON FUNCTION central_homologacao.server_power_gate(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.server_power_gate(text,uuid) TO central_homologacao_web,service_role;
REVOKE ALL ON FUNCTION public.central_server_power(text) FROM PUBLIC,anon,authenticated,central_homologacao_web;
GRANT EXECUTE ON FUNCTION public.central_server_power(text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
