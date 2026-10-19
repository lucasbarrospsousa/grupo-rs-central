-- Run outside a transaction to avoid blocking inventory writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS warehouse_available_page
ON central_homologacao.warehouse_items(branch_id,kind,status,received_at DESC,id)
INCLUDE(classification) WHERE deleted_at IS NULL;
INSERT INTO central_homologacao.migrations(version) VALUES(60) ON CONFLICT DO NOTHING;
