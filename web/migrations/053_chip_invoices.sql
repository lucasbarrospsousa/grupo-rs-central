BEGIN;
-- Invoice evidence is independent of current tariffs. Existing owner-only RLS applies.
ALTER TABLE central_homologacao.chip_cost_snapshots ADD COLUMN invoices jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(invoices)='array');
INSERT INTO central_homologacao.migrations(version) VALUES(53);
COMMIT;
