BEGIN;
ALTER TABLE central_homologacao.warehouse_items
 ADD COLUMN activation_batch uuid,
 ADD COLUMN activation_state text CHECK(activation_state IN ('prepared','requested','active')),
 ADD COLUMN activation_at timestamptz,
 ADD COLUMN activation_reference text,
 ADD CONSTRAINT warehouse_activation_pair CHECK ((activation_batch IS NULL) = (activation_state IS NULL));
CREATE UNIQUE INDEX warehouse_activation_serial ON central_homologacao.warehouse_items(serial) WHERE activation_state IS NOT NULL;
INSERT INTO central_homologacao.migrations(version) VALUES(48);
COMMIT;
