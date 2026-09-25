BEGIN;
CREATE TABLE IF NOT EXISTS central_homologacao.user_permissions(user_id uuid PRIMARY KEY REFERENCES central_homologacao.users(id) ON DELETE CASCADE,views text[] NOT NULL,writes text[] NOT NULL);
REVOKE ALL ON central_homologacao.user_permissions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON central_homologacao.user_permissions TO central_homologacao_web;
GRANT INSERT,UPDATE(active) ON central_homologacao.users TO central_homologacao_web;
GRANT INSERT,UPDATE ON central_homologacao.memberships TO central_homologacao_web;
GRANT SELECT ON central_homologacao.user_permissions TO central_backup;
INSERT INTO central_homologacao.migrations(version) VALUES(14) ON CONFLICT DO NOTHING;
COMMIT;
