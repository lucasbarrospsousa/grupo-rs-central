BEGIN;
-- Restricted cache invalidation after an authorized cross-branch device update.
-- No general observation write permission is granted to the web role.
CREATE OR REPLACE FUNCTION central_homologacao.take_transfer_observation(p_id uuid,p_from text,p_to text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE uid uuid:=nullif(current_setting('central.user_id',true),'')::uuid; snapshot jsonb; codes jsonb;
BEGIN
 IF p_from=p_to OR NOT EXISTS(SELECT 1 FROM central_homologacao.devices WHERE id=p_id AND branch_id=p_to AND deleted_at IS NULL)
 OR (SELECT count(DISTINCT branch_id) FROM central_homologacao.memberships WHERE user_id=uid AND branch_id IN(p_from,p_to) AND role IN('operator','admin'))<>2 THEN
  RAISE EXCEPTION 'Transfer not authorized' USING ERRCODE='42501';
 END IF;
 DELETE FROM central_homologacao.device_observations o WHERE device_id=p_id AND branch_id=p_from RETURNING to_jsonb(o) INTO snapshot;
 DELETE FROM central_homologacao.device_codes c WHERE device_id=p_id RETURNING to_jsonb(c) INTO codes;
 RETURN coalesce(snapshot,'{}'::jsonb)||jsonb_build_object('previous_device_codes',codes);
END $$;
REVOKE ALL ON FUNCTION central_homologacao.take_transfer_observation(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION central_homologacao.take_transfer_observation(uuid,text,text) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(59);
COMMIT;
