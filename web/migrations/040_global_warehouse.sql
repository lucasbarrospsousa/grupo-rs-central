BEGIN;
-- Read history for every branch the authenticated user may read.
CREATE POLICY warehouse_movement_read ON central_homologacao.warehouse_movements FOR SELECT USING (
 EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=warehouse_movements.branch_id AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid)
);

-- Exact serial match across the four bases; never guess between duplicates.
CREATE FUNCTION central_homologacao.track_warehouse_device() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE w central_homologacao.warehouse_items; actor uuid;
BEGIN
 IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO w FROM central_homologacao.warehouse_items
 WHERE kind='device' AND serial=NEW.serial AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM central_homologacao.devices WHERE serial=NEW.serial AND deleted_at IS NULL AND id<>NEW.id) THEN RETURN NEW; END IF;
 IF w.status='Utilizado' AND w.usage_device_serial=NEW.serial AND w.usage_branch=NEW.branch_id THEN RETURN NEW; END IF;
 actor=NULLIF(current_setting('central.user_id',true),'')::uuid;
 UPDATE central_homologacao.warehouse_items SET status='Utilizado',usage_device_serial=NEW.serial,
 usage_branch=NEW.branch_id,usage_detected_at=now(),version=version+1 WHERE id=w.id;
 INSERT INTO central_homologacao.warehouse_movements(id,user_id,branch_id,destination,note,items)
 VALUES(gen_random_uuid(),actor,w.branch_id,NEW.branch_id,'Cadastro do aparelho detectado na Central; horário da detecção',
 jsonb_build_array(jsonb_build_object('id',w.id,'serial',w.serial,'kind','device','action','Utilizado','device_serial',NEW.serial,'detected_at',now(),'time_basis','detection')));
 RETURN NEW;
END $$;
CREATE TRIGGER track_warehouse_device AFTER INSERT OR UPDATE OF serial,branch_id,deleted_at,data ON central_homologacao.devices
 FOR EACH ROW EXECUTE FUNCTION central_homologacao.track_warehouse_device();
REVOKE ALL ON FUNCTION central_homologacao.track_warehouse_device() FROM PUBLIC,anon,authenticated,central_homologacao_web;

CREATE OR REPLACE FUNCTION central_homologacao.track_device_chip() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE chip text; old_chip text; w central_homologacao.warehouse_items; actor uuid; event text; source text; old_phone text;
BEGIN
 -- APN-only enrichment must not create warehouse movements or change chip ownership.
 IF TG_OP='UPDATE' AND coalesce(current_setting('central.warehouse_reconcile',true),'')<>'1' THEN
  IF NEW.serial IS NOT DISTINCT FROM OLD.serial AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
   AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at AND (NEW.data-'apn') IS NOT DISTINCT FROM (OLD.data-'apn') THEN RETURN NEW; END IF;
 END IF;
 actor=NULLIF(current_setting('central.user_id',true),'')::uuid;
 source=coalesce(NULLIF(current_setting('central.chip_source',true),''),'Cadastro da Central');
 chip=regexp_replace(coalesce(NEW.data->>'iccid',''),'[^0-9]','','g');
 IF TG_OP='UPDATE' THEN old_chip=regexp_replace(coalesce(OLD.data->>'iccid',''),'[^0-9]','','g');old_phone=OLD.data->>'phone'; END IF;
 IF NEW.deleted_at IS NOT NULL THEN chip=''; END IF;
 IF old_chip ~ '^89[0-9]{17,18}$' AND old_chip IS DISTINCT FROM chip THEN
  SELECT * INTO w FROM central_homologacao.warehouse_items WHERE kind='chip' AND serial=old_chip AND deleted_at IS NULL FOR UPDATE;
  IF FOUND THEN
   INSERT INTO central_homologacao.warehouse_movements(id,user_id,branch_id,destination,note,items) VALUES(gen_random_uuid(),actor,w.branch_id,NEW.branch_id||' • Aparelho '||NEW.serial,source||' • desvinculação detectada; chip não retorna automaticamente à disponibilidade',jsonb_build_array(jsonb_build_object('id',w.id,'serial',old_chip,'kind','chip','action','Desvinculado','device_serial',NEW.serial,'detected_at',now(),'time_basis','detection')));
   UPDATE central_homologacao.warehouse_items SET usage_device_serial=NULL,usage_branch=NULL,version=version+1 WHERE id=w.id AND usage_device_serial=NEW.serial AND usage_branch=NEW.branch_id;
  END IF;
 END IF;
 IF chip !~ '^89[0-9]{17,18}$' THEN RETURN NEW; END IF;
 SELECT * INTO w FROM central_homologacao.warehouse_items WHERE kind='chip' AND serial=chip AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM central_homologacao.devices WHERE id<>NEW.id AND deleted_at IS NULL AND regexp_replace(coalesce(data->>'iccid',''),'[^0-9]','','g')=chip) THEN
  RAISE EXCEPTION 'Chip já associado a outro aparelho. Confira a vinculação antes de salvar.' USING ERRCODE='23514';
 END IF;
 IF w.status<>'Utilizado' OR w.usage_device_serial IS DISTINCT FROM NEW.serial OR w.usage_branch IS DISTINCT FROM NEW.branch_id THEN
  event='Utilizado';
  UPDATE central_homologacao.warehouse_items SET status='Utilizado',usage_device_serial=NEW.serial,usage_branch=NEW.branch_id,usage_detected_at=now(),version=version+1 WHERE id=w.id;
 ELSIF old_phone IS DISTINCT FROM NEW.data->>'phone' THEN event='Telefone atualizado';
 ELSE RETURN NEW; END IF;
 INSERT INTO central_homologacao.warehouse_movements(id,user_id,branch_id,destination,note,items) VALUES(gen_random_uuid(),actor,w.branch_id,NEW.branch_id||' • Aparelho '||NEW.serial,source||' • horário da detecção na Central',jsonb_build_array(jsonb_build_object('id',w.id,'serial',chip,'kind','chip','action',event,'device_serial',NEW.serial,'phone',NEW.data->>'phone','previous_iccid',old_chip,'detected_at',now(),'time_basis','detection')));
 RETURN NEW;
END $$;

-- New warehouse entries also recognize a device already registered in a base.
CREATE FUNCTION central_homologacao.match_new_warehouse_device() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE prior text;
BEGIN
 prior=current_setting('central.warehouse_reconcile',true);
 PERFORM set_config('central.warehouse_reconcile','1',true);
 IF NEW.kind='chip' AND NEW.deleted_at IS NULL AND (SELECT count(*) FROM central_homologacao.devices WHERE data->>'iccid'=NEW.serial AND deleted_at IS NULL)=1 THEN
  UPDATE central_homologacao.devices SET data=data WHERE data->>'iccid'=NEW.serial AND deleted_at IS NULL;
 END IF;
 IF NEW.kind='device' AND NEW.deleted_at IS NULL THEN
  UPDATE central_homologacao.devices SET data=data WHERE serial=NEW.serial AND deleted_at IS NULL;
 END IF;
 PERFORM set_config('central.warehouse_reconcile',coalesce(prior,''),true);
 RETURN NEW;
END $$;
CREATE TRIGGER match_new_warehouse_device AFTER INSERT ON central_homologacao.warehouse_items
 FOR EACH ROW EXECUTE FUNCTION central_homologacao.match_new_warehouse_device();
REVOKE ALL ON FUNCTION central_homologacao.match_new_warehouse_device() FROM PUBLIC,anon,authenticated,central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(40);
COMMIT;
