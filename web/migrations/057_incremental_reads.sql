BEGIN;
-- Serialize before row locks. A sequence/timestamp alone can skip late commits.
CREATE TABLE central_homologacao.read_clock(id boolean PRIMARY KEY DEFAULT true CHECK(id), revision bigint NOT NULL DEFAULT 0);
INSERT INTO central_homologacao.read_clock VALUES(true,0);
CREATE TABLE central_homologacao.read_changes(branch_id text NOT NULL, kind text NOT NULL, entity_id uuid NOT NULL, revision bigint NOT NULL, PRIMARY KEY(branch_id,kind,entity_id));
CREATE INDEX read_changes_cursor ON central_homologacao.read_changes(branch_id,kind,revision);
CREATE INDEX IF NOT EXISTS warehouse_usage_lookup ON central_homologacao.warehouse_items(usage_branch,usage_device_serial);
ALTER TABLE central_homologacao.read_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_changes_member ON central_homologacao.read_changes FOR SELECT USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=read_changes.branch_id AND m.user_id=nullif(current_setting('central.user_id',true),'')::uuid));
GRANT SELECT ON central_homologacao.read_changes,central_homologacao.read_clock TO central_homologacao_web;
CREATE FUNCTION central_homologacao.lock_read_clock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN PERFORM 1 FROM central_homologacao.read_clock WHERE id FOR UPDATE; RETURN NULL; END $$;
CREATE FUNCTION central_homologacao.mark_read_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE r bigint; oldrow jsonb; newrow jsonb; item jsonb; k text:=TG_ARGV[0]; eid uuid;
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' THEN oldrow=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN newrow=to_jsonb(NEW); END IF;
 UPDATE central_homologacao.read_clock SET revision=revision+1 WHERE id RETURNING revision INTO r;
 FOR item IN SELECT DISTINCT value FROM jsonb_array_elements(jsonb_build_array(oldrow,newrow)) WHERE value<>'null'::jsonb LOOP
  eid=coalesce(item->>'device_id',item->>'id')::uuid;
  INSERT INTO central_homologacao.read_changes VALUES(item->>'branch_id',k,eid,r) ON CONFLICT(branch_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
  IF TG_TABLE_NAME='devices' THEN
   INSERT INTO central_homologacao.read_changes SELECT w.branch_id,'warehouse',w.id,r FROM central_homologacao.warehouse_items w WHERE w.usage_branch=item->>'branch_id' AND w.usage_device_serial=item->>'serial'
   ON CONFLICT(branch_id,kind,entity_id) DO UPDATE SET revision=excluded.revision;
  END IF;
 END LOOP;
 RETURN coalesce(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION central_homologacao.lock_read_clock(),central_homologacao.mark_read_change() FROM PUBLIC;
DO $$ DECLARE t text; k text; BEGIN
 FOREACH t IN ARRAY ARRAY['devices','device_observations','warehouse_items','warehouse_movements'] LOOP
  k=CASE WHEN t IN ('devices','device_observations') THEN 'devices' WHEN t='warehouse_items' THEN 'warehouse' ELSE 'movements' END;
  EXECUTE format('CREATE TRIGGER read_lock BEFORE INSERT OR UPDATE OR DELETE ON central_homologacao.%I FOR EACH STATEMENT EXECUTE FUNCTION central_homologacao.lock_read_clock()',t);
  EXECUTE format('CREATE TRIGGER read_change AFTER INSERT OR UPDATE OR DELETE ON central_homologacao.%I FOR EACH ROW EXECUTE FUNCTION central_homologacao.mark_read_change(%L)',t,k);
 END LOOP;
END $$;
INSERT INTO central_homologacao.migrations(version) VALUES(57);
COMMIT;
