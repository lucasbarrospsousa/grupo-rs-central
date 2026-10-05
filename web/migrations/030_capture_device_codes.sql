BEGIN;
CREATE FUNCTION central_homologacao.capture_device_codes(p_serial text,p_data jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE device uuid;
BEGIN
 SELECT id INTO device FROM central_homologacao.devices WHERE branch_id='imperatriz' AND serial=p_serial AND deleted_at IS NULL;
 IF device IS NULL THEN RETURN false; END IF;
 RETURN central_homologacao.code_scan_save(null,device,p_serial,p_data);
END $$;
REVOKE ALL ON FUNCTION central_homologacao.capture_device_codes(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION central_homologacao.capture_device_codes(text,jsonb) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(30);
COMMIT;
