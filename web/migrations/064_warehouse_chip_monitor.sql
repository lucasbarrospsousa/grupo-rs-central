BEGIN;
ALTER TABLE central_homologacao.warehouse_items ADD COLUMN chip_monitor_due timestamptz, ADD COLUMN chip_monitor_lease uuid, ADD COLUMN chip_monitor_result jsonb;
CREATE INDEX warehouse_chip_due ON central_homologacao.warehouse_items(chip_monitor_due,id) WHERE kind='chip' AND status='Disponível' AND deleted_at IS NULL;
CREATE FUNCTION central_homologacao.warehouse_chip_claim(p_lease uuid) RETURNS TABLE(id uuid,serial text,chip_provider text,version integer) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 WITH picked AS (SELECT w.id FROM warehouse_items w WHERE w.kind='chip' AND w.status='Disponível' AND w.deleted_at IS NULL AND w.chip_provider IN ('arya','link') AND (w.chip_monitor_due IS NULL OR w.chip_monitor_due<=now()) ORDER BY w.chip_monitor_due NULLS FIRST,w.id LIMIT 5 FOR UPDATE SKIP LOCKED)
 UPDATE warehouse_items w SET chip_monitor_due=now()+interval '5 minutes',chip_monitor_lease=p_lease FROM picked p WHERE w.id=p.id RETURNING w.id,w.serial,w.chip_provider,w.version
$$;
CREATE FUNCTION central_homologacao.warehouse_chip_save(p_id uuid,p_lease uuid,p_version integer,p_state text,p_result jsonb,p_phone text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE n integer;
BEGIN
 IF p_state IS NOT NULL AND p_state NOT IN ('reserve','active') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 UPDATE warehouse_items w SET chip_monitor_result=p_result,chip_monitor_due=now()+CASE WHEN p_state IS NULL THEN interval '15 minutes' ELSE interval '1 hour' END,chip_monitor_lease=NULL,
 classification=CASE WHEN p_state='reserve' THEN 'Reserva' WHEN p_state='active' AND classification='Reserva' THEN 'Estoque' ELSE classification END,
 activation_state=CASE WHEN p_state='active' THEN 'active' WHEN p_state='reserve' THEN NULL ELSE activation_state END,
 activation_batch=CASE WHEN p_state='active' THEN coalesce(activation_batch,p_lease) WHEN p_state='reserve' THEN NULL ELSE activation_batch END,
 activation_at=CASE WHEN p_state='active' AND activation_state IS DISTINCT FROM 'active' THEN now() ELSE activation_at END,
 chip_phone=CASE WHEN p_state='active' AND p_phone~'^\+?[0-9]{8,20}$' THEN p_phone ELSE chip_phone END,version=version+1
 WHERE w.id=p_id AND w.chip_monitor_lease=p_lease AND w.version=p_version AND w.kind='chip' AND w.status='Disponível' AND w.deleted_at IS NULL AND w.serial=p_result->>'iccid' AND w.chip_provider=p_result->>'provider';
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.warehouse_chip_claim(uuid),central_homologacao.warehouse_chip_save(uuid,uuid,integer,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.warehouse_chip_claim(uuid),central_homologacao.warehouse_chip_save(uuid,uuid,integer,text,jsonb,text) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(64);
COMMIT;
