BEGIN;
CREATE TABLE central_homologacao.equipment_swaps(
 id uuid PRIMARY KEY, branch_id text NOT NULL REFERENCES central_homologacao.branches(id),user_id uuid NOT NULL REFERENCES central_homologacao.users(id),
 snapshot jsonb NOT NULL, phase text NOT NULL CHECK(phase IN ('preview','move_sent','return_sent','complete','cancelled')),result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_swap_per_branch ON central_homologacao.equipment_swaps(branch_id) WHERE phase IN ('move_sent','return_sent');
ALTER TABLE central_homologacao.equipment_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY swap_scope ON central_homologacao.equipment_swaps FOR ALL
 USING(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=equipment_swaps.branch_id AND m.user_id=nullif(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin')))
 WITH CHECK(EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=equipment_swaps.branch_id AND m.user_id=nullif(current_setting('central.user_id',true),'')::uuid AND m.role IN ('operator','admin')));
REVOKE ALL ON central_homologacao.equipment_swaps FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON central_homologacao.equipment_swaps TO central_homologacao_web;
CREATE FUNCTION central_homologacao.swap_link_fence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('central-swap-fence:'||NEW.branch_id));
 IF TG_TABLE_NAME='equipment_swaps' THEN
  IF NEW.phase IN ('move_sent','return_sent') AND EXISTS(SELECT 1 FROM remote_operations r WHERE r.branch_id=NEW.branch_id AND r.kind='link' AND r.state IN ('prepared','submitted','queued','pending','indeterminate') AND r.serial IN (NEW.snapshot->'incoming'->>'serial',NEW.snapshot->'outgoing'->>'serial')) THEN RAISE EXCEPTION 'Vinculação pendente para um dos aparelhos' USING ERRCODE='23505'; END IF;
 ELSE
  IF NEW.kind='link' AND NEW.state IN ('prepared','submitted','queued') AND EXISTS(SELECT 1 FROM equipment_swaps s WHERE s.branch_id=NEW.branch_id AND s.phase IN ('move_sent','return_sent') AND NEW.serial IN (s.snapshot->'incoming'->>'serial',s.snapshot->'outgoing'->>'serial')) THEN RAISE EXCEPTION 'Troca pendente para este aparelho' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER swap_link_guard BEFORE INSERT OR UPDATE ON central_homologacao.equipment_swaps FOR EACH ROW EXECUTE FUNCTION central_homologacao.swap_link_fence();
CREATE TRIGGER link_swap_guard BEFORE INSERT OR UPDATE ON central_homologacao.remote_operations FOR EACH ROW EXECUTE FUNCTION central_homologacao.swap_link_fence();
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_save(p_lease uuid,p_id uuid,p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE saved boolean;
BEGIN
 -- An empty API APN never erases the last known value; record the check separately.
 IF coalesce(trim(p_data->>'apn'),'')='' THEN p_data:=p_data-'apn';END IF;
 saved:=code_scan_store(p_lease,p_id,p_serial,p_data);
 IF saved THEN
  IF p_data->>'state'<>'error' THEN UPDATE device_codes SET apn_checked_at=now() WHERE device_id=p_id;END IF;
  IF p_lease IS NOT NULL THEN UPDATE device_codes SET review_cycle=(SELECT c.review_cycle FROM code_scan_branches c JOIN devices d ON d.branch_id=c.branch_id WHERE d.id=p_id) WHERE device_id=p_id;END IF;
 END IF;
 IF saved AND p_data->>'state' IN ('confirmed','divergent') THEN
  UPDATE devices d SET data=d.data||jsonb_build_object('plate',p_data->>'api_plate','binding_checked_at',now()),version=version+1,updated_at=now()
  WHERE d.id=p_id AND d.serial=p_serial AND d.deleted_at IS NULL AND d.data->>'status'='Instalado'
   AND coalesce(d.data->>'plate','') IS DISTINCT FROM p_data->>'api_plate'
   AND NOT EXISTS(SELECT 1 FROM equipment_swaps s WHERE s.branch_id=d.branch_id AND s.phase NOT IN ('preview','complete','cancelled') AND (s.snapshot->'incoming'->>'serial'=d.serial OR s.snapshot->'outgoing'->>'serial'=d.serial));
  UPDATE device_codes c SET local_plate=d.data->>'plate',state='confirmed' FROM devices d WHERE c.device_id=d.id AND d.id=p_id AND d.data->>'status'='Instalado' AND d.data->>'plate'=c.api_plate;
 END IF;
 RETURN saved;
END $$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_candidates(p_branch text) RETURNS TABLE(id uuid,serial text,plate text,priority integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),
 CASE WHEN (d.data->>'status'='Instalado' AND coalesce(r.checked_at,'epoch'::timestamptz)<now()-interval '6 hours' AND (r.retry_at IS NULL OR r.retry_at<=now())) OR
  r.device_id IS NULL OR r.serial<>d.serial OR r.equipment_id IS NULL THEN 0 ELSE 1 END
 FROM devices d LEFT JOIN device_codes r ON r.device_id=d.id CROSS JOIN code_scan_branches c
 CROSS JOIN LATERAL code_scan_window(now(),c.night_start,c.night_end) w
 WHERE d.branch_id=p_branch AND d.deleted_at IS NULL AND c.branch_id=p_branch AND (
  (d.data->>'status'='Instalado' AND coalesce(r.checked_at,'epoch'::timestamptz)<now()-interval '6 hours' AND (r.retry_at IS NULL OR r.retry_at<=now())) OR
  r.device_id IS NULL OR r.serial<>d.serial OR
  (r.equipment_id IS NULL AND r.state='error' AND r.attempts<3 AND r.retry_at<=now()) OR
  (c.nightly_enabled AND w.is_open AND c.review_started_at IS NOT NULL AND c.review_completed_at IS NULL AND coalesce(r.review_cycle,0)<c.review_cycle)
 )
 ORDER BY 4,r.checked_at NULLS FIRST,d.serial
$$;
INSERT INTO central_homologacao.migrations(version) VALUES(41);
COMMIT;
