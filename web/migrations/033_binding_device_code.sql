BEGIN;
CREATE FUNCTION central_homologacao.binding_device_code(p_branch text,p_serial text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT c.equipment_id FROM central_homologacao.device_codes c JOIN central_homologacao.devices d ON d.id=c.device_id AND d.serial=c.serial
 WHERE d.branch_id=p_branch AND d.serial=p_serial AND d.deleted_at IS NULL AND c.equipment_id ~ '^[1-9][0-9]*$'
$$;
REVOKE ALL ON FUNCTION central_homologacao.binding_device_code(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION central_homologacao.binding_device_code(text,text) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(33);
COMMIT;
