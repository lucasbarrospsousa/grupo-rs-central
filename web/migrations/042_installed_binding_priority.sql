BEGIN;
CREATE OR REPLACE FUNCTION central_homologacao.code_scan_candidates(p_branch text) RETURNS TABLE(id uuid,serial text,plate text,priority integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 SELECT d.id,d.serial,coalesce(nullif(d.data->>'plate',''),d.data->>'identification',''),
 CASE WHEN (d.data->>'status'='Instalado' AND (r.state='divergent' OR coalesce(r.checked_at,'epoch'::timestamptz)<now()-interval '6 hours') AND (r.retry_at IS NULL OR r.retry_at<=now())) OR
  r.device_id IS NULL OR r.serial<>d.serial OR r.equipment_id IS NULL THEN 0 ELSE 1 END
 FROM devices d LEFT JOIN device_codes r ON r.device_id=d.id CROSS JOIN code_scan_branches c
 CROSS JOIN LATERAL code_scan_window(now(),c.night_start,c.night_end) w
 WHERE d.branch_id=p_branch AND d.deleted_at IS NULL AND c.branch_id=p_branch AND (
  (d.data->>'status'='Instalado' AND (r.state='divergent' OR coalesce(r.checked_at,'epoch'::timestamptz)<now()-interval '6 hours') AND (r.retry_at IS NULL OR r.retry_at<=now())) OR
  r.device_id IS NULL OR r.serial<>d.serial OR
  (r.equipment_id IS NULL AND r.state='error' AND r.attempts<3 AND r.retry_at<=now()) OR
  (c.nightly_enabled AND w.is_open AND c.review_started_at IS NOT NULL AND c.review_completed_at IS NULL AND coalesce(r.review_cycle,0)<c.review_cycle)
 )
 ORDER BY 4,r.checked_at NULLS FIRST,d.serial
$$;
INSERT INTO central_homologacao.migrations(version) VALUES(42);
COMMIT;
