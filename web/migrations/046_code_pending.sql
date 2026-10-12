BEGIN;
CREATE OR REPLACE FUNCTION central_homologacao.settings_code_progress() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 WITH saved AS (
 SELECT b.id AS branch_id,d.id,d.serial,d.data->>'plate' AS plate,d.data->>'status' AS status,
 c.equipment_id IS NOT NULL AS equipment_ok,
 c.vehicle_id IS NOT NULL AND coalesce(c.api_plate,'')<>'' AS vehicle_ok,
 coalesce((d.data->>'status'='Instalado'
  AND d.data#>>'{owner_binding,branch}'=d.branch_id AND d.data#>>'{owner_binding,serial}'=d.serial
  AND d.data#>>'{owner_binding,equipment_id}'=c.equipment_id::text AND d.data#>>'{owner_binding,vehicle_id}'=c.vehicle_id::text
  AND d.data#>>'{owner_binding,client_id}'~'^[1-9][0-9]*$' AND coalesce(d.data#>>'{owner_binding,client}','')<>''
  AND regexp_replace(upper(d.data#>>'{owner_binding,plate}'),'[^A-Z0-9]','','g')=regexp_replace(upper(d.data->>'plate'),'[^A-Z0-9]','','g')
  AND d.data#>>'{owner_binding,checked_at}'>=to_char((now() at time zone 'UTC')-interval '6 hours','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),false) AS owner_ok
 FROM branches b LEFT JOIN devices d ON d.branch_id=b.id AND d.deleted_at IS NULL
 LEFT JOIN device_codes c ON c.device_id=d.id AND c.serial=d.serial
 ), grouped AS (
 SELECT branch_id,count(id) AS total,
 count(id) FILTER(WHERE equipment_ok) AS equipment_saved,
 count(id) FILTER(WHERE vehicle_ok) AS vehicle_saved,
 count(id) FILTER(WHERE status='Instalado') AS owner_total,
 count(id) FILTER(WHERE owner_ok) AS owner_confirmed,
 coalesce(jsonb_agg(jsonb_build_object('serial',serial,'plate',plate,'status',status,'missing',array_remove(ARRAY[
 CASE WHEN NOT vehicle_ok THEN 'vehicle' END,CASE WHEN NOT equipment_ok THEN 'equipment' END,CASE WHEN status='Instalado' AND NOT owner_ok THEN 'owner' END],NULL)) ORDER BY serial)
 FILTER(WHERE id IS NOT NULL AND (NOT vehicle_ok OR NOT equipment_ok OR (status='Instalado' AND NOT owner_ok))),'[]'::jsonb) AS pending
 FROM saved GROUP BY branch_id
 ) SELECT coalesce(jsonb_agg(grouped ORDER BY branch_id),'[]'::jsonb) FROM grouped
$$;
INSERT INTO central_homologacao.migrations(version) VALUES(46);
COMMIT;
