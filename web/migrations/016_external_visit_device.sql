BEGIN;
-- Arrival devices confirmed by the platform need not be in Central inventory.
-- Their original serial remains preserved in visits.data.currentSerial.
ALTER TABLE central_homologacao.visits ALTER COLUMN device_id DROP NOT NULL;
INSERT INTO central_homologacao.migrations(version) VALUES(16);
COMMIT;
