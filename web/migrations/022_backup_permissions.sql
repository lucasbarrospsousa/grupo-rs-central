BEGIN;
-- Backup may read the private schema, but receives no operational write permission.
GRANT SELECT ON ALL TABLES IN SCHEMA central_homologacao TO central_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA central_homologacao TO central_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA central_homologacao GRANT SELECT ON TABLES TO central_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA central_homologacao GRANT SELECT ON SEQUENCES TO central_backup;
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='central_homologacao' AND rowsecurity LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='central_homologacao' AND tablename=t.tablename AND policyname='central_backup_read') THEN
   EXECUTE format('CREATE POLICY central_backup_read ON central_homologacao.%I FOR SELECT TO central_backup USING (true)',t.tablename);
  END IF;
 END LOOP;
END $$;
INSERT INTO central_homologacao.migrations(version) VALUES(22) ON CONFLICT DO NOTHING;
COMMIT;
