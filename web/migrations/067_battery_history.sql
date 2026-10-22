BEGIN;
CREATE TABLE central_homologacao.battery_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id uuid NOT NULL REFERENCES central_homologacao.devices,
 branch_id text NOT NULL REFERENCES central_homologacao.branches,
 serial text NOT NULL, model text, observed_at timestamptz NOT NULL,
 sample jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(device_id,branch_id,observed_at)
);
CREATE INDEX battery_history_branch_time ON central_homologacao.battery_history(branch_id,observed_at DESC);
CREATE INDEX battery_history_retention ON central_homologacao.battery_history(observed_at);
ALTER TABLE central_homologacao.battery_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY battery_read ON central_homologacao.battery_history FOR SELECT USING (
 observed_at>=now()-interval '30 days' AND EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=battery_history.branch_id AND m.user_id=nullif(current_setting('central.user_id',true),'')::uuid)
);
GRANT SELECT ON central_homologacao.battery_history TO central_homologacao_web;
CREATE FUNCTION central_homologacao.capture_battery(p_branch text,p_serial text,p_sample jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE d devices; t timestamptz;
BEGIN
 SELECT * INTO d FROM devices WHERE branch_id=p_branch AND serial=p_serial AND deleted_at IS NULL;
 IF d.id IS NULL OR regexp_replace(lower(coalesce(d.data->>'carrier','')),'[^a-z]','','g') NOT IN ('multi','multioperadora') THEN RETURN; END IF;
 BEGIN t:=(p_sample->>'at')::timestamptz; EXCEPTION WHEN OTHERS THEN RETURN; END;
 IF t IS NULL OR t<now()-interval '30 days' OR t>now()+interval '5 minutes' THEN RETURN; END IF;
 INSERT INTO battery_history(device_id,branch_id,serial,model,observed_at,sample) VALUES(d.id,p_branch,p_serial,d.data->>'model',t,p_sample)
 ON CONFLICT(device_id,branch_id,observed_at) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.capture_battery(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.capture_battery(text,text,jsonb) TO central_homologacao_web;
SELECT cron.schedule('central-battery-retention','17 * * * *', $job$DELETE FROM central_homologacao.battery_history WHERE observed_at<now()-interval '30 days'$job$);
INSERT INTO central_homologacao.migrations(version) VALUES(67);
COMMIT;
