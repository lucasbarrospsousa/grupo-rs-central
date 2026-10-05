BEGIN;
ALTER TABLE central_homologacao.device_codes ADD COLUMN apn text,ADD COLUMN apn_iccid text,ADD COLUMN apn_checked_at timestamptz;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.code_scan_control; items jsonb;
BEGIN
 SELECT * INTO c FROM central_homologacao.code_scan_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_at>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification','') AS plate FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_codes r ON r.device_id=d.id WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL AND (r.device_id IS NULL OR r.serial<>d.serial OR (r.state='error' AND r.attempts<3 AND r.retry_at<=now()) OR (r.state<>'error' AND r.apn_checked_at IS NULL AND coalesce(trim(d.data->>'apn'),'')='')) ORDER BY central_homologacao.is_monitored_stock(d.branch_id,d.data) DESC,r.checked_at NULLS FIRST,d.serial LIMIT 10) x;
 IF items IS NULL THEN RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true); END IF;
 UPDATE central_homologacao.code_scan_control SET lease=p_lease,lease_until=now()+interval '3 minutes',batch=batch+1,started_at=now(),last_tick=now(),next_at=now()+make_interval(secs=>interval_seconds),batch_ids=ARRAY(SELECT (v->>'id')::uuid FROM jsonb_array_elements(items) v) WHERE id RETURNING * INTO c;
 RETURN jsonb_build_object('rows',items,'batch',c.batch);
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_save(p_lease uuid,p_id uuid,p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.code_scan_control; d central_homologacao.devices; state text; old central_homologacao.device_codes;
BEGIN
 SELECT * INTO c FROM central_homologacao.code_scan_control WHERE id FOR UPDATE;
 IF p_lease IS NOT NULL AND (c.lease IS DISTINCT FROM p_lease OR c.lease_until<=now() OR NOT p_id=ANY(c.batch_ids)) THEN RETURN false; END IF;
 SELECT * INTO d FROM central_homologacao.devices WHERE id=p_id AND serial=p_serial AND branch_id='imperatriz' AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 state:=p_data->>'state';
 IF state NOT IN ('confirmed','divergent','unlinked','error') THEN RAISE EXCEPTION 'Invalid result'; END IF;
 IF state<>'error' AND (coalesce(p_data->>'equipment_id','')!~'^[1-9][0-9]*$' OR (state<>'unlinked' AND (coalesce(p_data->>'vehicle_id','')!~'^[1-9][0-9]*$' OR coalesce(p_data->>'api_plate','')=''))) THEN RAISE EXCEPTION 'Unconfirmed codes'; END IF;
 IF state IN ('confirmed','divergent') THEN state:=CASE WHEN regexp_replace(upper(coalesce(nullif(d.data->>'plate',''),d.data->>'identification','')),'[^A-Z0-9]','','g')=regexp_replace(upper(p_data->>'api_plate'),'[^A-Z0-9]','','g') THEN 'confirmed' ELSE 'divergent' END; END IF;
 SELECT * INTO old FROM central_homologacao.device_codes WHERE device_id=p_id;
 INSERT INTO central_homologacao.device_codes(device_id,serial,equipment_id,vehicle_id,api_plate,local_plate,state,attempts,retry_at,message,batch)
 VALUES(p_id,p_serial,CASE WHEN state='error' THEN old.equipment_id ELSE p_data->>'equipment_id' END,CASE WHEN state='error' THEN old.vehicle_id ELSE p_data->>'vehicle_id' END,CASE WHEN state='error' THEN old.api_plate ELSE p_data->>'api_plate' END,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),state,CASE WHEN old.serial=p_serial THEN coalesce(old.attempts,0)+1 ELSE 1 END,CASE WHEN state='error' THEN now()+interval '10 minutes' END,left(p_data->>'message',250),CASE WHEN p_lease IS NOT NULL THEN c.batch ELSE old.batch END)
 ON CONFLICT(device_id) DO UPDATE SET serial=excluded.serial,equipment_id=excluded.equipment_id,vehicle_id=excluded.vehicle_id,api_plate=excluded.api_plate,local_plate=excluded.local_plate,state=excluded.state,checked_at=now(),attempts=CASE WHEN excluded.state='error' THEN excluded.attempts ELSE 0 END,retry_at=excluded.retry_at,message=excluded.message,batch=excluded.batch;
 IF state<>'error' AND p_data ? 'apn' THEN
  UPDATE central_homologacao.device_codes SET apn=nullif(left(trim(p_data->>'apn'),200),''),apn_iccid=nullif(p_data->>'iccid',''),apn_checked_at=now() WHERE device_id=p_id;
  -- An APN is applied only to the exact SIM still attached to this device.
  UPDATE central_homologacao.devices SET data=jsonb_set(data,'{apn}',to_jsonb(lower(trim(p_data->>'apn')))),version=version+1,updated_at=now()
  WHERE id=p_id AND serial=p_serial AND deleted_at IS NULL
    AND coalesce(p_data->>'apn','')<>'' AND length(p_data->>'apn')<=200
    AND coalesce(p_data->>'iccid','') ~ '^89[0-9]{17,18}$' AND data->>'iccid'=p_data->>'iccid'
    AND data->>'apn' IS DISTINCT FROM lower(trim(p_data->>'apn'));
 END IF;
 IF p_lease IS NOT NULL THEN UPDATE central_homologacao.code_scan_control SET last_tick=now(),lease_until=now()+interval '3 minutes' WHERE id; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.dispatch_code_scan() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.code_scan_control; result bigint;
BEGIN
 SELECT * INTO c FROM central_homologacao.code_scan_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() OR c.next_at>now() OR c.dispatched_at>now()-interval '25 seconds' THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_codes r ON r.device_id=d.id WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL AND (r.device_id IS NULL OR r.serial<>d.serial OR (r.state='error' AND r.attempts<3 AND r.retry_at<=now()) OR (r.state<>'error' AND r.apn_checked_at IS NULL AND coalesce(trim(d.data->>'apn'),'')=''))) THEN RETURN NULL; END IF;
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/codes',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=120000) INTO result;
 UPDATE central_homologacao.code_scan_control SET dispatched_at=now() WHERE id; RETURN result;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.sync_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE c central_homologacao.sync_control; items jsonb;
BEGIN
 SELECT * INTO c FROM central_homologacao.sync_control WHERE id FOR UPDATE;
 IF NOT c.enabled OR c.lease_until>now() THEN RETURN jsonb_build_object('rows','[]'::jsonb); END IF;
 SELECT jsonb_agg(to_jsonb(x)) INTO items FROM (
 SELECT d.id,d.branch_id AS branch,d.serial,d.data->>'iccid' AS iccid,d.data->>'apn' AS apn,o.data->'chip' AS chip,o.data->>'chip_checked_at' AS chip_checked_at,o.data->'chip'->>'provider' AS provider,
 (o.data->>'chip_checked_at' IS NULL OR (o.data->>'chip_checked_at')::timestamptz<=now()-interval '1 hour' OR coalesce(o.data->>'monitor_iccid','')<>coalesce(d.data->>'iccid','') OR coalesce(o.data->>'monitor_apn','')<>coalesce(d.data->>'apn','')) AS chip_due
 FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_observations o ON o.device_id=d.id
 WHERE d.deleted_at IS NULL AND central_homologacao.is_monitored_stock(d.branch_id,d.data) AND (o.checked_at IS NULL OR o.checked_at<=now()-make_interval(mins=>c.interval_minutes))
 ORDER BY o.checked_at NULLS FIRST,d.branch_id,d.serial LIMIT 50) x;
 IF items IS NULL THEN RETURN jsonb_build_object('rows','[]'::jsonb,'complete',true); END IF;
 IF c.next_cycle_at IS NULL OR c.next_cycle_at<=now() THEN UPDATE central_homologacao.sync_control SET cycle=cycle+1,started_at=now(),next_cycle_at=now()+make_interval(mins=>interval_minutes) WHERE id RETURNING * INTO c; END IF;
 UPDATE central_homologacao.sync_control SET lease=p_lease,lease_until=now()+interval '2 minutes',last_tick=now() WHERE id;
 RETURN jsonb_build_object('rows',items,'cycle',c.cycle);
END $$;

CREATE OR REPLACE FUNCTION central_homologacao.code_scan_status(p_state text DEFAULT NULL,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 WITH records AS (SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification','') AS expected,r.api_plate,r.equipment_id,r.vehicle_id,r.state,r.checked_at,r.message,r.batch,d.data->>'apn' AS apn,r.apn_checked_at FROM central_homologacao.devices d LEFT JOIN central_homologacao.device_codes r ON r.device_id=d.id AND r.serial=d.serial WHERE d.branch_id='imperatriz' AND d.deleted_at IS NULL)
 SELECT to_jsonb(c)-'lease'-'batch_ids'||jsonb_build_object('server_at',now(),'apn_saved',(SELECT count(*) FROM records WHERE coalesce(trim(apn),'')<>''),'apn_pending',(SELECT count(*) FROM records WHERE coalesce(trim(apn),'')='' AND apn_checked_at IS NULL),'total',(SELECT count(*) FROM records),'processed',(SELECT count(*) FROM records WHERE state IS NOT NULL),'confirmed',(SELECT count(*) FROM records WHERE state='confirmed'),'divergent',(SELECT count(*) FROM records WHERE state='divergent'),'unlinked',(SELECT count(*) FROM records WHERE state='unlinked'),'errors',(SELECT count(*) FROM records WHERE state='error'),'batch_size',cardinality(c.batch_ids),'batch_done',(SELECT count(*) FROM records WHERE batch=c.batch),'detail_total',(SELECT count(*) FROM records WHERE CASE WHEN p_state IS NULL THEN id=ANY(c.batch_ids) ELSE state=p_state END),'rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM records WHERE CASE WHEN p_state IS NULL THEN id=ANY(c.batch_ids) ELSE state=p_state END ORDER BY serial LIMIT 10 OFFSET greatest(0,least(p_offset,100000))) x),'[]'::jsonb)) FROM central_homologacao.code_scan_control c WHERE id
$$;

CREATE OR REPLACE FUNCTION central_homologacao.track_device_chip() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE chip text; old_chip text; w central_homologacao.warehouse_items; actor uuid; event text; source text; old_phone text;
BEGIN
 -- APN-only enrichment must not create warehouse movements or change chip ownership.
 IF TG_OP='UPDATE' THEN
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

INSERT INTO central_homologacao.migrations(version) VALUES(32);
COMMIT;
