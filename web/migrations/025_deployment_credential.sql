BEGIN;
CREATE TABLE IF NOT EXISTS central_homologacao.deployment_credential(id boolean PRIMARY KEY CHECK(id),encrypted text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON central_homologacao.deployment_credential FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON central_homologacao.deployment_credential TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(25) ON CONFLICT DO NOTHING;
COMMIT;
