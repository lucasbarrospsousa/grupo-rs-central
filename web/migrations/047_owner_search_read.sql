BEGIN;
-- Only the four binding columns used by the installed-owner search.
GRANT SELECT(device_id,serial,equipment_id,vehicle_id) ON central_homologacao.device_codes TO central_homologacao_web;
CREATE POLICY owner_search_codes_read ON central_homologacao.device_codes
 FOR SELECT TO central_homologacao_web USING (
  EXISTS(SELECT 1 FROM central_homologacao.devices d
   WHERE d.id=device_codes.device_id AND d.serial=device_codes.serial
    AND d.deleted_at IS NULL AND d.data->>'status'='Instalado'
    AND EXISTS(SELECT 1 FROM central_homologacao.memberships m
     WHERE m.branch_id=d.branch_id
      AND m.user_id=NULLIF(current_setting('central.user_id',true),'')::uuid))
 );
INSERT INTO central_homologacao.migrations(version) VALUES(47);
COMMIT;
