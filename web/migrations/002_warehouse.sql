BEGIN;
CREATE TABLE central_homologacao.warehouse_items (
 id uuid PRIMARY KEY, branch_id text NOT NULL REFERENCES central_homologacao.branches,
 kind text NOT NULL CHECK(kind IN ('device','chip')), serial text NOT NULL,
 status text NOT NULL CHECK(status IN ('Disponível','Utilizado','Enviado')), received_at timestamptz NOT NULL,
 version integer NOT NULL DEFAULT 1, deleted_at timestamptz, UNIQUE(kind,serial)
);
CREATE TABLE central_homologacao.warehouse_movements (
 id uuid PRIMARY KEY, user_id uuid REFERENCES central_homologacao.users,
 branch_id text NOT NULL REFERENCES central_homologacao.branches,
 destination text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 items jsonb NOT NULL
);
ALTER TABLE central_homologacao.legacy_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY history_read ON central_homologacao.legacy_records FOR SELECT USING (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=legacy_records.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid)
);
ALTER TABLE central_homologacao.warehouse_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.warehouse_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY warehouse_read ON central_homologacao.warehouse_items FOR SELECT USING (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=warehouse_items.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid)
);
CREATE POLICY warehouse_write ON central_homologacao.warehouse_items FOR ALL USING (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=warehouse_items.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role='admin')
) WITH CHECK (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=warehouse_items.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role='admin')
);
CREATE POLICY warehouse_movement ON central_homologacao.warehouse_movements FOR ALL USING (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=warehouse_movements.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role='admin')
) WITH CHECK (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=warehouse_movements.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role='admin')
);
GRANT SELECT ON central_homologacao.legacy_records TO central_homologacao_web;
GRANT SELECT,INSERT,UPDATE ON central_homologacao.warehouse_items TO central_homologacao_web;
GRANT SELECT,INSERT ON central_homologacao.warehouse_movements TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(2);
COMMIT;
