BEGIN;
-- A historical visit survives even when the arriving device is absent from today's inventory.
ALTER TABLE central_homologacao.visits ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE central_homologacao.visits ADD CONSTRAINT visit_historical_identity CHECK (
 device_id IS NOT NULL OR (
  data->>'source_table' = 'maintenance' AND length(coalesce(data->>'source_id','')) > 0
  AND length(coalesce(data->>'currentSerial','')) > 0
  AND length(coalesce(data->>'client','')) > 0 AND length(coalesce(data->>'plate','')) > 0
 ) IS TRUE
);
CREATE UNIQUE INDEX visit_legacy_identity ON central_homologacao.visits(branch_id,(data->>'source_id')) WHERE data->>'source_table'='maintenance';
INSERT INTO central_homologacao.migrations(version) VALUES(10);
COMMIT;
