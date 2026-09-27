BEGIN;
CREATE TABLE IF NOT EXISTS central_homologacao.system_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 user_id uuid, username text NOT NULL, branch_id text,
 module text NOT NULL, action text NOT NULL, outcome text NOT NULL,
 entity text NOT NULL DEFAULT '', details jsonb NOT NULL DEFAULT '{}',
 CHECK(octet_length(details::text)<=16384)
);
CREATE INDEX IF NOT EXISTS system_logs_time ON central_homologacao.system_logs(occurred_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS system_logs_user ON central_homologacao.system_logs(username,occurred_at DESC);
REVOKE ALL ON central_homologacao.system_logs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON central_homologacao.system_logs TO central_homologacao_web;
GRANT USAGE ON SEQUENCE central_homologacao.system_logs_id_seq TO central_homologacao_web;
GRANT SELECT ON central_homologacao.system_logs TO central_backup;

-- Only this new rolling journal is pruned. Existing audit_events are preserved.
-- A logical 8 MiB budget is independent from the provider's unknown plan quota.
CREATE OR REPLACE FUNCTION central_homologacao.trim_system_logs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(180927);
 DELETE FROM central_homologacao.system_logs WHERE id IN (
   SELECT id FROM (SELECT id,row_number() OVER(ORDER BY id DESC) AS n,
    sum(octet_length(to_jsonb(s)::text)) OVER(ORDER BY id DESC) AS bytes
    FROM central_homologacao.system_logs s) t WHERE n>10000 OR bytes>8388608
 );
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.trim_system_logs() FROM PUBLIC;
DROP TRIGGER IF EXISTS trim_system_logs ON central_homologacao.system_logs;
CREATE TRIGGER trim_system_logs AFTER INSERT ON central_homologacao.system_logs FOR EACH STATEMENT EXECUTE FUNCTION central_homologacao.trim_system_logs();

CREATE OR REPLACE FUNCTION central_homologacao.capture_system_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE oldrow jsonb; newrow jsonb; oldvalues jsonb; newvalues jsonb; changes jsonb='{}'; k text;
 actor uuid; actorname text; label text; mod text; rowdata jsonb;
BEGIN
 oldrow=CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
 newrow=CASE WHEN TG_OP='DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
 oldvalues=oldrow || coalesce(oldrow->'data','{}'::jsonb);
 newvalues=newrow || coalesce(newrow->'data','{}'::jsonb);
 -- Whitelist: never include hashes, secrets, tokens, free-text notes or SMS commands.
 FOREACH k IN ARRAY ARRAY['serial','identification','plate','client','carrier','model','status','iccid','phone','installed_at','deleted_at','kind','destination','username','active','views','writes','currentSerial','installSerial','reason','medium','state'] LOOP
  IF oldvalues->k IS DISTINCT FROM newvalues->k THEN
   changes=changes||jsonb_build_object(k,jsonb_build_object('before',oldvalues->k,'after',newvalues->k));
  END IF;
 END LOOP;
 IF TG_TABLE_NAME='users' AND oldrow->'password_hash' IS DISTINCT FROM newrow->'password_hash' THEN
  changes=changes||jsonb_build_object('password_changed',true);
 END IF;
 IF changes='{}'::jsonb THEN RETURN NULL; END IF;
 actor=nullif(current_setting('central.user_id',true),'')::uuid;
 SELECT username INTO actorname FROM central_homologacao.users WHERE id=actor;
 rowdata=CASE WHEN TG_OP='DELETE' THEN oldvalues ELSE newvalues END;
 label=coalesce(rowdata->>'serial',rowdata->>'username',rowdata->>'currentSerial',rowdata->>'id',rowdata->>'user_id','');
 mod=CASE TG_TABLE_NAME WHEN 'devices' THEN 'stock' WHEN 'visits' THEN 'maintenance' WHEN 'users' THEN 'users' WHEN 'user_permissions' THEN 'users' WHEN 'remote_operations' THEN 'integrations' ELSE 'warehouse' END;
 INSERT INTO central_homologacao.system_logs(user_id,username,branch_id,module,action,outcome,entity,details)
 VALUES(actor,coalesce(actorname,'Sistema'),rowdata->>'branch_id',mod,TG_OP,'change',left(label,120),
 CASE WHEN octet_length(changes::text)<=15000 THEN changes ELSE jsonb_build_object('summary','Alteração extensa; consultar registro original') END);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.capture_system_change() FROM PUBLIC;
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['devices','visits','warehouse_items','warehouse_movements','users','user_permissions','remote_operations'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS system_change ON central_homologacao.%I',t);
  EXECUTE format('CREATE TRIGGER system_change AFTER INSERT OR UPDATE OR DELETE ON central_homologacao.%I FOR EACH ROW EXECUTE FUNCTION central_homologacao.capture_system_change()',t);
 END LOOP;
END $$;
-- Bring forward only the safe metadata of the most recent original events.
-- No fabricated before/after values for records that did not capture them.
INSERT INTO central_homologacao.system_logs(occurred_at,user_id,username,branch_id,module,action,outcome,entity,details)
SELECT a.occurred_at,a.user_id,u.username,a.branch_id,
 CASE WHEN a.action ILIKE '%maintenance%' THEN 'maintenance' WHEN a.action ILIKE '%warehouse%' OR a.action ILIKE '%chip%' THEN 'warehouse' ELSE 'stock' END,
 a.action,'legacy',a.entity_id::text,
 jsonb_strip_nulls(jsonb_build_object('source','Auditoria anterior','beforeVersion',a.details->'beforeVersion','afterVersion',a.details->'afterVersion'))
FROM (SELECT * FROM central_homologacao.audit_events ORDER BY occurred_at DESC,id DESC LIMIT 10000) a
JOIN central_homologacao.users u ON u.id=a.user_id
WHERE NOT EXISTS(SELECT 1 FROM central_homologacao.migrations WHERE version=18)
ORDER BY a.occurred_at,a.id;
INSERT INTO central_homologacao.migrations(version) VALUES(18) ON CONFLICT DO NOTHING;
COMMIT;
