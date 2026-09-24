BEGIN;
CREATE TABLE central_homologacao.visits (
 id uuid PRIMARY KEY, branch_id text NOT NULL REFERENCES central_homologacao.branches,
 device_id uuid NOT NULL REFERENCES central_homologacao.devices,
 data jsonb NOT NULL, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE central_homologacao.visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY visits_read ON central_homologacao.visits FOR SELECT USING (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=visits.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid)
);
CREATE POLICY visits_write ON central_homologacao.visits FOR ALL USING (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=visits.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin'))
) WITH CHECK (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=visits.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin'))
);
GRANT SELECT,INSERT,UPDATE ON central_homologacao.visits TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(3);
COMMIT;
