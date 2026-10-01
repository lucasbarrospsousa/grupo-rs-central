BEGIN;
CREATE TABLE IF NOT EXISTS central_homologacao.read_sources(
 branch_id text PRIMARY KEY REFERENCES central_homologacao.branches(id),
 mode text NOT NULL DEFAULT 'api' CHECK(mode IN ('api','web','both')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO central_homologacao.read_sources(branch_id) SELECT id FROM central_homologacao.branches ON CONFLICT DO NOTHING;
REVOKE ALL ON central_homologacao.read_sources FROM PUBLIC;
GRANT SELECT,UPDATE ON central_homologacao.read_sources TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(24) ON CONFLICT DO NOTHING;
COMMIT;
