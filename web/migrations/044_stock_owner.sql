BEGIN;
CREATE FUNCTION central_homologacao.owner_context(p_branch text,p_serial text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('version',d.version,'plate',d.data->>'plate','hint',d.data->>'client','owner',d.data->'owner_binding','vehicle_id',c.vehicle_id,'equipment_id',c.equipment_id)
 FROM devices d LEFT JOIN device_codes c ON c.device_id=d.id AND c.serial=d.serial
 WHERE d.branch_id=p_branch AND d.serial=p_serial AND d.deleted_at IS NULL AND d.data->>'status'='Instalado'
 AND NOT EXISTS(SELECT 1 FROM equipment_swaps s WHERE s.branch_id=p_branch AND s.phase IN ('move_sent','return_sent') AND p_serial IN (s.snapshot->'incoming'->>'serial',s.snapshot->'outgoing'->>'serial'))
$$;
CREATE FUNCTION central_homologacao.owner_save(p_branch text,p_serial text,p_version integer,p_owner jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE n integer;
BEGIN
 UPDATE devices d SET data=(d.data-'owner_binding')||CASE WHEN p_owner IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('owner_binding',p_owner,'client',p_owner->>'client') END,version=version+1
 WHERE d.branch_id=p_branch AND d.serial=p_serial AND d.version=p_version AND d.deleted_at IS NULL AND d.data->>'status'='Instalado'
 AND (p_owner IS NULL OR (p_owner->>'branch'=p_branch AND p_owner->>'serial'=p_serial AND coalesce(p_owner->>'client','')<>'' AND p_owner->>'client_id'~'^[1-9][0-9]*$' AND EXISTS(SELECT 1 FROM device_codes c WHERE c.device_id=d.id AND c.serial=d.serial AND c.vehicle_id::text=p_owner->>'vehicle_id' AND c.equipment_id::text=p_owner->>'equipment_id' AND regexp_replace(upper(d.data->>'plate'),'[^A-Z0-9]','','g')=regexp_replace(upper(p_owner->>'plate'),'[^A-Z0-9]','','g'))))
 AND NOT EXISTS(SELECT 1 FROM equipment_swaps s WHERE s.branch_id=p_branch AND s.phase IN ('move_sent','return_sent') AND p_serial IN (s.snapshot->'incoming'->>'serial',s.snapshot->'outgoing'->>'serial'));
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.owner_context(text,text),central_homologacao.owner_save(text,text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.owner_context(text,text),central_homologacao.owner_save(text,text,integer,jsonb) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(44);
COMMIT;
