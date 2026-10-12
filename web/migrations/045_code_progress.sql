BEGIN;
CREATE FUNCTION central_homologacao.settings_code_progress() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT coalesce(jsonb_agg(t),'[]'::jsonb) FROM (
 SELECT b.id AS branch_id,count(d.id) AS total,
 count(d.id) FILTER(WHERE c.equipment_id IS NOT NULL) AS equipment_saved,
 count(d.id) FILTER(WHERE c.vehicle_id IS NOT NULL AND coalesce(c.api_plate,'')<>'') AS vehicle_saved,
 count(d.id) FILTER(WHERE d.data->>'status'='Instalado') AS owner_total,
 count(d.id) FILTER(WHERE d.data->>'status'='Instalado'
  AND d.data#>>'{owner_binding,branch}'=d.branch_id AND d.data#>>'{owner_binding,serial}'=d.serial
  AND d.data#>>'{owner_binding,equipment_id}'=c.equipment_id::text AND d.data#>>'{owner_binding,vehicle_id}'=c.vehicle_id::text
  AND d.data#>>'{owner_binding,client_id}'~'^[1-9][0-9]*$' AND coalesce(d.data#>>'{owner_binding,client}','')<>''
  AND regexp_replace(upper(d.data#>>'{owner_binding,plate}'),'[^A-Z0-9]','','g')=regexp_replace(upper(d.data->>'plate'),'[^A-Z0-9]','','g')
  AND d.data#>>'{owner_binding,checked_at}'>=to_char((now() at time zone 'UTC')-interval '6 hours','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 ) AS owner_confirmed
 FROM branches b LEFT JOIN devices d ON d.branch_id=b.id AND d.deleted_at IS NULL
 LEFT JOIN device_codes c ON c.device_id=d.id AND c.serial=d.serial
 GROUP BY b.id ORDER BY b.id
 ) t
$$;
REVOKE ALL ON FUNCTION central_homologacao.settings_code_progress() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.settings_code_progress() TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(45);
COMMIT;
