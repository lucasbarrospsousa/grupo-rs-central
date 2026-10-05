BEGIN;
CREATE FUNCTION central_homologacao.location_device_codes(p_branch text,p_serial text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT jsonb_build_object('vehicle_id',c.vehicle_id,'equipment_id',c.equipment_id)
 FROM central_homologacao.device_codes c JOIN central_homologacao.devices d ON d.id=c.device_id AND d.serial=c.serial
 WHERE p_branch='imperatriz' AND d.branch_id=p_branch AND d.serial=p_serial AND d.deleted_at IS NULL
 AND c.state IN ('confirmed','divergent') AND c.vehicle_id ~ '^[1-9][0-9]*$' AND c.equipment_id ~ '^[1-9][0-9]*$'
$$;
REVOKE ALL ON FUNCTION central_homologacao.location_device_codes(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION central_homologacao.location_device_codes(text,text) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(31);
COMMIT;
