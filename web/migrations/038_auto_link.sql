BEGIN;
CREATE TABLE central_homologacao.link_targets(
 branch_id text NOT NULL REFERENCES central_homologacao.branches,
 prefix text NOT NULL CHECK(prefix IN ('GRS','AAA','XRS')), number integer NOT NULL CHECK(number BETWEEN 1 AND 999999),
 plate text NOT NULL, vehicle_id text CHECK(vehicle_id ~ '^[1-9][0-9]*$'), client_id text NOT NULL CHECK(client_id ~ '^[1-9][0-9]*$'),
 state text NOT NULL DEFAULT 'available' CHECK(state IN ('available','reserved','occupied','confirmed')),
 operation_id uuid, PRIMARY KEY(branch_id,prefix,number), UNIQUE(branch_id,vehicle_id)
);
ALTER TABLE central_homologacao.link_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY link_targets_scope ON central_homologacao.link_targets FOR ALL
 USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=link_targets.branch_id AND m.user_id=nullif(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin')))
 WITH CHECK(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=link_targets.branch_id AND m.user_id=nullif(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin')));
GRANT SELECT,INSERT,UPDATE ON central_homologacao.link_targets TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(38);
COMMIT;
