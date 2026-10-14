BEGIN;
CREATE OR REPLACE FUNCTION central_homologacao.settings_code_progress() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 WITH saved AS (
 SELECT b.id AS branch_id,d.id,d.serial,d.data->>'plate' AS plate,d.data->>'status' AS status,
 d.data#>>'{owner_binding,checked_at}' AS owner_checked_at,
 c.equipment_id IS NOT NULL AS equipment_ok,
 c.vehicle_id IS NOT NULL AND coalesce(c.api_plate,'')<>'' AS vehicle_ok,
 coalesce((d.data->>'status'='Instalado'
  AND d.data#>>'{owner_binding,branch}'=d.branch_id AND d.data#>>'{owner_binding,serial}'=d.serial
  AND d.data#>>'{owner_binding,equipment_id}'=c.equipment_id::text AND d.data#>>'{owner_binding,vehicle_id}'=c.vehicle_id::text
  AND d.data#>>'{owner_binding,client_id}'~'^[1-9][0-9]*$' AND coalesce(d.data#>>'{owner_binding,client}','')<>''
  AND regexp_replace(upper(d.data#>>'{owner_binding,plate}'),'[^A-Z0-9]','','g')=regexp_replace(upper(d.data->>'plate'),'[^A-Z0-9]','','g')
),false) AS owner_ok
 FROM branches b LEFT JOIN devices d ON d.branch_id=b.id AND d.deleted_at IS NULL
 LEFT JOIN device_codes c ON c.device_id=d.id AND c.serial=d.serial
 ), grouped AS (
 SELECT branch_id,count(id) AS total,
 count(id) FILTER(WHERE equipment_ok) AS equipment_saved,
 count(id) FILTER(WHERE vehicle_ok) AS vehicle_saved,
 count(id) FILTER(WHERE status='Instalado') AS owner_total,
 count(id) FILTER(WHERE owner_ok) AS owner_confirmed,
 count(id) FILTER(WHERE owner_ok AND owner_checked_at>=to_char((now() at time zone 'UTC')-interval '6 hours','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS owner_recent,
 coalesce(jsonb_agg(jsonb_build_object('serial',serial,'plate',plate,'status',status,'missing',array_remove(ARRAY[
 CASE WHEN NOT vehicle_ok THEN 'vehicle' END,CASE WHEN NOT equipment_ok THEN 'equipment' END,CASE WHEN status='Instalado' AND NOT owner_ok THEN 'owner' END],NULL)) ORDER BY serial)
 FILTER(WHERE id IS NOT NULL AND (NOT vehicle_ok OR NOT equipment_ok OR (status='Instalado' AND NOT owner_ok))),'[]'::jsonb) AS pending
 FROM saved GROUP BY branch_id
 ) SELECT coalesce(jsonb_agg(grouped ORDER BY branch_id),'[]'::jsonb) FROM grouped
$$;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_candidates(p_branch text) RETURNS TABLE(id uuid,serial text,plate text,priority integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),
 CASE WHEN r.device_id IS NULL OR r.serial<>d.serial OR r.equipment_id IS NULL OR (d.data->>'status'='Instalado' AND NOT (coalesce(d.data#>>'{owner_binding,branch}'=d.branch_id AND d.data#>>'{owner_binding,serial}'=d.serial AND d.data#>>'{owner_binding,equipment_id}'=r.equipment_id::text AND d.data#>>'{owner_binding,vehicle_id}'=r.vehicle_id::text AND d.data#>>'{owner_binding,client_id}'~'^[1-9][0-9]*$' AND coalesce(d.data#>>'{owner_binding,client}','')<>'' AND regexp_replace(upper(d.data#>>'{owner_binding,plate}'),'[^A-Z0-9]','','g')=regexp_replace(upper(d.data->>'plate'),'[^A-Z0-9]','','g'),false)) AND coalesce(r.checked_at,'epoch'::timestamptz)<now()-interval '15 minutes' AND (r.retry_at IS NULL OR r.retry_at<=now())) THEN 0 ELSE 1 END
 FROM devices d LEFT JOIN device_codes r ON r.device_id=d.id CROSS JOIN code_scan_branches c
 CROSS JOIN LATERAL code_scan_window(now(),c.night_start,c.night_end) w
 WHERE d.branch_id=p_branch AND d.deleted_at IS NULL AND c.branch_id=p_branch AND (
  (d.data->>'status'='Instalado' AND NOT (coalesce(d.data#>>'{owner_binding,branch}'=d.branch_id AND d.data#>>'{owner_binding,serial}'=d.serial AND d.data#>>'{owner_binding,equipment_id}'=r.equipment_id::text AND d.data#>>'{owner_binding,vehicle_id}'=r.vehicle_id::text AND d.data#>>'{owner_binding,client_id}'~'^[1-9][0-9]*$' AND coalesce(d.data#>>'{owner_binding,client}','')<>'' AND regexp_replace(upper(d.data#>>'{owner_binding,plate}'),'[^A-Z0-9]','','g')=regexp_replace(upper(d.data->>'plate'),'[^A-Z0-9]','','g'),false)) AND coalesce(r.checked_at,'epoch'::timestamptz)<now()-interval '15 minutes' AND (r.retry_at IS NULL OR r.retry_at<=now())) OR
  (d.data->>'status'='Instalado' AND (r.state='divergent' OR coalesce(r.checked_at,'epoch'::timestamptz)<now()-interval '6 hours') AND (r.retry_at IS NULL OR r.retry_at<=now())) OR
  r.device_id IS NULL OR r.serial<>d.serial OR
  (r.equipment_id IS NULL AND r.state='error' AND r.attempts<3 AND r.retry_at<=now()) OR
  (c.nightly_enabled AND w.is_open AND c.review_started_at IS NOT NULL AND c.review_completed_at IS NULL AND coalesce(r.review_cycle,0)<c.review_cycle)
 )
 ORDER BY 4,r.checked_at NULLS FIRST,d.serial
$$;

INSERT INTO central_homologacao.migrations(version) VALUES(52);
COMMIT;
