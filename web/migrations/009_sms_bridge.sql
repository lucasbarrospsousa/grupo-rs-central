BEGIN;
CREATE TABLE central_homologacao.sms_bridge_status(
 branch_id text PRIMARY KEY REFERENCES central_homologacao.branches,
 healthy boolean NOT NULL DEFAULT false, checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE central_homologacao.sms_bridge_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY bridge_read ON central_homologacao.sms_bridge_status FOR SELECT USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=sms_bridge_status.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid));
CREATE POLICY bridge_write ON central_homologacao.sms_bridge_status FOR ALL USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=sms_bridge_status.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role='admin')) WITH CHECK(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=sms_bridge_status.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role='admin'));
GRANT SELECT,INSERT,UPDATE ON central_homologacao.sms_bridge_status TO central_homologacao_web;
CREATE UNIQUE INDEX one_sms_active ON central_homologacao.remote_operations(branch_id,serial) WHERE kind='sms' AND state IN('queued','pending','received','sending','indeterminate');
INSERT INTO central_homologacao.migrations(version) VALUES(9);
COMMIT;
