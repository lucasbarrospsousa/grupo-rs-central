BEGIN;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='central_backup') THEN CREATE ROLE central_backup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; END $$;
CREATE TABLE central_homologacao.backup_control (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'not_configured', folder_id text, account_email text,
 next_run_at timestamptz, lease uuid, lease_until timestamptz, last_attempt_at timestamptz,
 last_success_at timestamptz, last_error text, drive_checked_at timestamptz,
 drive jsonb NOT NULL DEFAULT '{}', retention_days integer NOT NULL DEFAULT 30 CHECK(retention_days=30)
);
INSERT INTO central_homologacao.backup_control(id) VALUES(true);
CREATE TABLE central_homologacao.backup_runs (
 id uuid PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 state text NOT NULL CHECK(state IN ('running','verified','failed')), file_id text,
 bytes bigint, sha256 text, tables_count integer, rows_count bigint,
 restore_verified boolean NOT NULL DEFAULT false, error_code text
);
GRANT USAGE ON SCHEMA central_homologacao TO central_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA central_homologacao TO central_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA central_homologacao TO central_backup;
GRANT UPDATE ON central_homologacao.backup_control TO central_backup;
GRANT INSERT,UPDATE ON central_homologacao.backup_runs TO central_backup;
GRANT SELECT ON central_homologacao.backup_control,central_homologacao.backup_runs TO central_homologacao_web;
-- The backup login reads only this schema; it cannot modify operational records.
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='central_homologacao' AND rowsecurity LOOP
 EXECUTE format('CREATE POLICY central_backup_read ON central_homologacao.%I FOR SELECT TO central_backup USING (true)',t.tablename);
 END LOOP;
END $$;
REVOKE ALL ON central_homologacao.backup_control,central_homologacao.backup_runs FROM PUBLIC,anon,authenticated;
INSERT INTO central_homologacao.migrations(version) VALUES(12);
COMMIT;
