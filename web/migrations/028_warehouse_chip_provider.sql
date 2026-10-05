BEGIN;
ALTER TABLE central_homologacao.warehouse_items
 ADD COLUMN chip_provider text CHECK(chip_provider IN ('arya','link')),
 ADD COLUMN chip_operator text,
 ADD COLUMN chip_phone text;
INSERT INTO central_homologacao.migrations(version) VALUES(28);
COMMIT;
