BEGIN;
ALTER TABLE central_homologacao.visits DROP CONSTRAINT visit_historical_identity;
ALTER TABLE central_homologacao.visits ADD CONSTRAINT visit_historical_identity CHECK (
 device_id IS NOT NULL OR (
  ((data->>'source_table' = 'maintenance' AND length(coalesce(data->>'source_id','')) > 0)
   OR (length(coalesce(data->>'client_id','')) > 0 AND length(coalesce(data->>'vehicle_id','')) > 0))
  AND length(coalesce(data->>'currentSerial','')) > 0
  AND length(coalesce(data->>'client','')) > 0 AND length(coalesce(data->>'plate','')) > 0
 ) IS TRUE
);
INSERT INTO central_homologacao.migrations(version) VALUES(17);
COMMIT;
