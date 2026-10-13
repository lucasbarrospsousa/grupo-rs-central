BEGIN;
ALTER TABLE central_homologacao.warehouse_items DROP CONSTRAINT warehouse_items_activation_state_check;
ALTER TABLE central_homologacao.warehouse_items ADD CONSTRAINT warehouse_items_activation_state_check CHECK(activation_state IN ('prepared','sending','uncertain','requested','active'));
INSERT INTO central_homologacao.migrations(version) VALUES(49);
COMMIT;
