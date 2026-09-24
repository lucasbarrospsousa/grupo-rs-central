BEGIN;
CREATE TABLE central_homologacao.login_limits (
 key_hash text PRIMARY KEY,
 attempts integer NOT NULL,
 until_at timestamptz NOT NULL
);
REVOKE ALL ON central_homologacao.login_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON central_homologacao.login_limits TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(5);
COMMIT;
