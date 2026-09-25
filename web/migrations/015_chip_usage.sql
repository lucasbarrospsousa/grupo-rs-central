BEGIN;
ALTER TABLE central_homologacao.warehouse_items ADD COLUMN usage_device_serial text, ADD COLUMN usage_branch text, ADD COLUMN usage_detected_at timestamptz;
CREATE FUNCTION central_homologacao.track_device_chip() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE chip text; old_chip text; w central_homologacao.warehouse_items; actor uuid; event text; source text; old_phone text;
BEGIN
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
CREATE TRIGGER track_device_chip AFTER INSERT OR UPDATE OF data,serial,branch_id,deleted_at ON central_homologacao.devices FOR EACH ROW EXECUTE FUNCTION central_homologacao.track_device_chip();
REVOKE ALL ON FUNCTION central_homologacao.track_device_chip() FROM PUBLIC,anon,authenticated,central_homologacao_web;
CREATE OR REPLACE FUNCTION central_homologacao.apply_device_contacts(p_id uuid,p_equipment jsonb,p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE d central_homologacao.devices; w central_homologacao.warehouse_items;
 chip text; phone text; patch jsonb:='{}'; movement uuid; actor uuid; reason text:='';
BEGIN
 IF p_at IS NULL OR p_at<now()-interval '1 hour' OR p_at>now()+interval '1 minute' OR coalesce(p_equipment->>'ok','true')<>'true' THEN RETURN jsonb_build_object('confirmed',false); END IF;
 chip=btrim(coalesce(p_equipment->>'iccid',''));
 phone=regexp_replace(coalesce(p_equipment->>'phone',''),'[^0-9]','','g');
 -- Serialize concurrent observations of the same chip before checking uniqueness.
 IF chip ~ '^89[0-9]{17,18}$' THEN PERFORM pg_advisory_xact_lock(hashtext('contact-chip:'||chip)); END IF;
 SELECT * INTO d FROM central_homologacao.devices WHERE id=p_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_equipment->>'serial' IS DISTINCT FROM d.serial THEN RETURN jsonb_build_object('confirmed',false); END IF;
 SELECT user_id INTO actor FROM central_homologacao.memberships WHERE branch_id=d.branch_id AND role='admin' ORDER BY user_id LIMIT 1;
 IF actor IS NULL THEN RETURN jsonb_build_object('confirmed',false); END IF;
 IF chip ~ '^89[0-9]{17,18}$' AND coalesce(d.data->>'iccid','') IS DISTINCT FROM chip AND NOT EXISTS(SELECT 1 FROM central_homologacao.devices WHERE id<>d.id AND deleted_at IS NULL AND data->>'iccid'=chip) THEN patch=patch||jsonb_build_object('iccid',chip); END IF;
 IF (patch ? 'iccid' OR d.data->>'iccid'=chip) AND phone ~ '^[0-9]{10,13}$' AND regexp_replace(coalesce(d.data->>'phone',''),'[^0-9]','','g') IS DISTINCT FROM phone THEN patch=patch||jsonb_build_object('phone',phone); END IF;
 IF patch ? 'iccid' AND NOT (patch ? 'phone') AND phone !~ '^[0-9]{10,13}$' THEN patch=patch||jsonb_build_object('phone',''); END IF;
 PERFORM set_config('central.chip_source','Consulta da plataforma/API',true);
 IF patch<>'{}'::jsonb THEN
  UPDATE central_homologacao.devices SET data=data||patch,version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  INSERT INTO central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) VALUES(d.branch_id,actor,'PLATFORM_CONTACTS_FILLED',d.id,jsonb_build_object('fields',ARRAY(SELECT jsonb_object_keys(patch)),'queried_at',p_at,'source','platform_equipment_and_carrier','automatic',true));
 END IF;
 IF patch='{}'::jsonb AND d.data->>'iccid'=chip THEN UPDATE central_homologacao.devices SET data=data WHERE id=d.id; END IF;
 PERFORM set_config('central.chip_source','',true);
 RETURN jsonb_build_object('confirmed',true,'filled',patch,'movementId',movement,'warehouse_note',reason,'device',jsonb_build_object('id',d.id,'version',d.version,'iccid',d.data->>'iccid','phone',d.data->>'phone'));
END $$;

INSERT INTO central_homologacao.migrations(version) VALUES(15);
COMMIT;
