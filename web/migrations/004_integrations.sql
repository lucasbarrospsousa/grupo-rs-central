BEGIN;
CREATE TABLE central_homologacao.remote_operations(
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES central_homologacao.users,
 branch_id text NOT NULL REFERENCES central_homologacao.branches,
 kind text NOT NULL CHECK(kind IN ('link','sms')), serial text NOT NULL,
 payload jsonb NOT NULL, state text NOT NULL DEFAULT 'prepared', result jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_remote_pending ON central_homologacao.remote_operations(branch_id,kind,serial) WHERE state IN ('prepared','submitted','pending');
ALTER TABLE central_homologacao.remote_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY operations_read ON central_homologacao.remote_operations FOR SELECT USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=remote_operations.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid));
CREATE POLICY operations_write ON central_homologacao.remote_operations FOR ALL USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=remote_operations.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin'))) WITH CHECK(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=remote_operations.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin')));
GRANT SELECT,INSERT,UPDATE ON central_homologacao.remote_operations TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(4);
COMMIT;
