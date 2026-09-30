BEGIN;
-- Preserve explicit Central edits while the upstream API still reports the old chip.
DO $migration$
DECLARE definition text; needle text; replacement text;
BEGIN
 definition:=pg_get_functiondef('central_homologacao.apply_device_contacts(uuid,jsonb,timestamptz)'::regprocedure);
 needle:=' SELECT user_id INTO actor FROM central_homologacao.memberships';
 replacement:=$code$
 IF jsonb_typeof(d.data->'pending_contacts')='object' THEN
  IF chip IS DISTINCT FROM coalesce(d.data->'pending_contacts'->>'iccid','') OR phone IS DISTINCT FROM coalesce(d.data->'pending_contacts'->>'phone','') THEN
   RETURN jsonb_build_object('confirmed',true,'filled','{}'::jsonb,'warehouse_note','Edição manual preservada: a API ainda informa outro chip ou telefone.','device',jsonb_build_object('id',d.id,'version',d.version,'iccid',d.data->>'iccid','phone',d.data->>'phone'));
  END IF;
  patch:=patch||jsonb_build_object('pending_contacts',NULL);
 END IF;
 SELECT user_id INTO actor FROM central_homologacao.memberships$code$;
 IF position(needle in definition)=0 OR position('pending_contacts' in definition)>0 THEN RAISE EXCEPTION 'Unexpected contacts function'; END IF;
 EXECUTE replace(definition,needle,replacement);
END $migration$;
INSERT INTO central_homologacao.migrations(version) VALUES(21);
COMMIT;
