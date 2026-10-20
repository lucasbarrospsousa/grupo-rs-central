BEGIN;
CREATE TABLE central_homologacao.integration_session_cache(
 session_key text PRIMARY KEY,
 payload text NOT NULL,
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL
);
REVOKE ALL ON central_homologacao.integration_session_cache FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON central_homologacao.integration_session_cache TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(63);
COMMIT;
