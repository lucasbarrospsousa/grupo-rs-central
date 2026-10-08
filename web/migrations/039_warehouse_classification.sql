BEGIN;
ALTER TABLE central_homologacao.warehouse_items
 ADD COLUMN classification text NOT NULL DEFAULT 'Estoque'
 CHECK(classification IN ('Estoque','Reserva','Emergência'));
INSERT INTO central_homologacao.migrations(version) VALUES(39);
COMMIT;
