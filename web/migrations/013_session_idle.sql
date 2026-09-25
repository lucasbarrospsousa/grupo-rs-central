BEGIN;
ALTER TABLE central_homologacao.sessions ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
GRANT UPDATE(last_activity_at) ON central_homologacao.sessions TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(13) ON CONFLICT DO NOTHING;
COMMIT;
