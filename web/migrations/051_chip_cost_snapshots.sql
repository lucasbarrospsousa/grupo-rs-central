BEGIN;
-- Private per-provider snapshots contain only normalized per-ICCID prices,
-- lifecycle, operator and plan. No credentials or customer personal data.
CREATE TABLE central_homologacao.chip_cost_snapshots(
 provider text PRIMARY KEY CHECK(provider IN ('arya','link')),
 items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(items)='array'),
 checked_at timestamptz,last_attempt timestamptz,last_error text,refresh_until timestamptz
);
INSERT INTO central_homologacao.chip_cost_snapshots(provider) VALUES('arya'),('link');
ALTER TABLE central_homologacao.chip_cost_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY cost_owner ON central_homologacao.chip_cost_snapshots FOR ALL
 USING(EXISTS(SELECT 1 FROM central_homologacao.users WHERE id=nullif(current_setting('central.user_id',true),'')::uuid AND username='lucasabm' AND active))
 WITH CHECK(EXISTS(SELECT 1 FROM central_homologacao.users WHERE id=nullif(current_setting('central.user_id',true),'')::uuid AND username='lucasabm' AND active));
REVOKE ALL ON central_homologacao.chip_cost_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON central_homologacao.chip_cost_snapshots TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(51);
COMMIT;
