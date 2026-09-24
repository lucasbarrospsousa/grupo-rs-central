BEGIN;
-- Only trusted server observations may fill missing contacts or consume warehouse chips.
CREATE FUNCTION central_homologacao.apply_device_contacts(p_id uuid,p_equipment jsonb,p_at timestamptz)
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
 IF chip ~ '^89[0-9]{17,18}$' AND btrim(coalesce(d.data->>'iccid','')) IN ('','—','-') THEN patch=patch||jsonb_build_object('iccid',chip); END IF;
 IF (coalesce(d.data->>'iccid','') IN ('','—','-') OR d.data->>'iccid'=chip) AND phone ~ '^[0-9]{10,13}$' AND regexp_replace(coalesce(d.data->>'phone',''),'[^0-9]','','g') !~ '^[0-9]{10,13}$' THEN patch=patch||jsonb_build_object('phone',phone); END IF;
 IF patch<>'{}'::jsonb THEN
  UPDATE central_homologacao.devices SET data=data||patch,version=version+1,updated_at=now() WHERE id=d.id RETURNING * INTO d;
  INSERT INTO central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) VALUES(d.branch_id,actor,'PLATFORM_CONTACTS_FILLED',d.id,jsonb_build_object('fields',ARRAY(SELECT jsonb_object_keys(patch)),'queried_at',p_at,'source','platform_equipment_and_carrier','automatic',true));
 END IF;
 IF chip ~ '^89[0-9]{17,18}$' THEN
  SELECT * INTO w FROM central_homologacao.warehouse_items WHERE kind='chip' AND serial=chip AND deleted_at IS NULL FOR UPDATE;
  IF FOUND THEN
   IF d.data->>'iccid' IS DISTINCT FROM chip THEN reason='ICCID do cadastro difere da plataforma';
   ELSIF w.branch_id<>d.branch_id THEN reason='Chip em outra filial';
   ELSIF (SELECT count(*) FROM central_homologacao.devices WHERE data->>'iccid'=chip AND deleted_at IS NULL)<>1 THEN reason='Chip associado a mais de um aparelho';
   ELSIF w.status='Utilizado' THEN reason='Já utilizado';
   ELSIF w.status<>'Disponível' THEN reason='Conferir movimentação anterior';
   ELSE
    movement=gen_random_uuid();
    UPDATE central_homologacao.warehouse_items SET status='Utilizado',version=version+1 WHERE id=w.id;
    INSERT INTO central_homologacao.warehouse_movements(id,branch_id,destination,note,items)
     VALUES(movement,d.branch_id,d.branch_id||' • Aparelho '||d.serial,'Uso confirmado na consulta da plataforma',jsonb_build_array(jsonb_build_object('id',w.id,'serial',chip,'kind','chip','action','Utilizado','device_serial',d.serial)));
    INSERT INTO central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) VALUES(d.branch_id,actor,'PLATFORM_CHIP_USED',w.id,jsonb_build_object('movementId',movement,'serial',d.serial,'queried_at',p_at));
   END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('confirmed',true,'filled',patch,'movementId',movement,'warehouse_note',reason,'device',jsonb_build_object('id',d.id,'version',d.version,'iccid',d.data->>'iccid','phone',d.data->>'phone'));
END $$;
CREATE FUNCTION central_homologacao.observation_contacts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 PERFORM central_homologacao.apply_device_contacts(NEW.device_id,NEW.data->'equipment',NEW.checked_at);
 RETURN NEW;
END $$;
CREATE TRIGGER observation_contacts AFTER INSERT OR UPDATE ON central_homologacao.device_observations FOR EACH ROW EXECUTE FUNCTION central_homologacao.observation_contacts();
CREATE FUNCTION central_homologacao.save_device_contacts(p_branch text,p_serial text,p_equipment jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE target uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM central_homologacao.memberships WHERE branch_id=p_branch AND user_id=NULLIF(current_setting('central.user_id',true),'')::uuid AND role IN ('admin','operator')) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
 SELECT id INTO target FROM central_homologacao.devices WHERE branch_id=p_branch AND serial=p_serial AND deleted_at IS NULL;
 RETURN central_homologacao.apply_device_contacts(target,p_equipment,now());
END $$;
REVOKE ALL ON FUNCTION central_homologacao.apply_device_contacts(uuid,jsonb,timestamptz),central_homologacao.observation_contacts(),central_homologacao.save_device_contacts(text,text,jsonb) FROM PUBLIC,anon,authenticated,central_homologacao_web;
GRANT EXECUTE ON FUNCTION central_homologacao.save_device_contacts(text,text,jsonb) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(11);
COMMIT;
