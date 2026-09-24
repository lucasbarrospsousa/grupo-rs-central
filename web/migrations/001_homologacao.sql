-- Private rehearsal schema only. Never targets desktop SQLite or public tables.
BEGIN;
CREATE SCHEMA central_homologacao;
REVOKE ALL ON SCHEMA central_homologacao FROM PUBLIC, anon, authenticated;
CREATE TABLE central_homologacao.migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE central_homologacao.imports (
  id uuid PRIMARY KEY, source_hash text NOT NULL UNIQUE CHECK (length(source_hash)=64),
  imported_at timestamptz NOT NULL DEFAULT now(), counts jsonb NOT NULL
);
CREATE TABLE central_homologacao.branches (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE central_homologacao.users (
  id uuid PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE central_homologacao.memberships (
  user_id uuid REFERENCES central_homologacao.users ON DELETE CASCADE,
  branch_id text REFERENCES central_homologacao.branches,
  role text NOT NULL CHECK(role IN ('reader','operator','admin')),
  PRIMARY KEY(user_id,branch_id)
);
CREATE TABLE central_homologacao.sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES central_homologacao.users ON DELETE CASCADE,
  csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE central_homologacao.devices (
  id uuid PRIMARY KEY, branch_id text NOT NULL REFERENCES central_homologacao.branches,
  source_id text, serial text NOT NULL CHECK(serial ~ '^[0-9]{6,17}$'),
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  deleted_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(branch_id,source_id)
);
CREATE UNIQUE INDEX device_active_serial ON central_homologacao.devices(branch_id,serial) WHERE deleted_at IS NULL;
CREATE TABLE central_homologacao.legacy_records (
  import_id uuid NOT NULL REFERENCES central_homologacao.imports,
  source_table text NOT NULL, source_id text NOT NULL, branch_id text NOT NULL REFERENCES central_homologacao.branches,
  data jsonb NOT NULL, PRIMARY KEY(import_id,source_table,source_id)
);
CREATE TABLE central_homologacao.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, branch_id text NOT NULL REFERENCES central_homologacao.branches,
  user_id uuid NOT NULL REFERENCES central_homologacao.users, action text NOT NULL,
  entity_id uuid NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE central_homologacao.requests (
  user_id uuid NOT NULL REFERENCES central_homologacao.users, request_key uuid NOT NULL,
  fingerprint text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_key)
);
ALTER TABLE central_homologacao.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.devices FORCE ROW LEVEL SECURITY;
CREATE POLICY device_read ON central_homologacao.devices FOR SELECT USING (
  EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=devices.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid)
);
CREATE POLICY device_insert ON central_homologacao.devices FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=devices.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin'))
);
CREATE POLICY device_update ON central_homologacao.devices FOR UPDATE USING (
  EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=devices.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin'))
) WITH CHECK (
  EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=devices.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin'))
);
-- No DELETE grant/policy: HTTP DELETE uses an audited, recoverable tombstone.
INSERT INTO central_homologacao.migrations(version) VALUES (1);
COMMIT;
