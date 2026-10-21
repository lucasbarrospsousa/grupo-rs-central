BEGIN;
-- Reserve polling never treats connectivity as lifecycle or demotes manual stock.
CREATE OR REPLACE FUNCTION central_homologacao.warehouse_chip_claim(p_lease uuid) RETURNS TABLE(id uuid,serial text,chip_provider text,version integer) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 WITH picked AS (SELECT w.id FROM warehouse_items w WHERE w.kind='chip' AND w.status='Disponível' AND w.classification='Reserva' AND w.deleted_at IS NULL AND w.chip_provider IN ('arya','link') AND (w.chip_monitor_due IS NULL OR w.chip_monitor_due<=now()) ORDER BY w.chip_monitor_due NULLS FIRST,w.id LIMIT 5 FOR UPDATE SKIP LOCKED)
 UPDATE warehouse_items w SET chip_monitor_due=now()+interval '5 minutes',chip_monitor_lease=p_lease FROM picked p WHERE w.id=p.id RETURNING w.id,w.serial,w.chip_provider,w.version
$$;
CREATE OR REPLACE FUNCTION central_homologacao.warehouse_chip_save(p_id uuid,p_lease uuid,p_version integer,p_state text,p_result jsonb,p_phone text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE n integer;
BEGIN
 IF p_state IS NOT NULL AND p_state NOT IN ('reserve','active') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 UPDATE warehouse_items w SET chip_monitor_result=p_result,chip_monitor_due=now()+CASE WHEN p_state IS NULL THEN interval '15 minutes' ELSE interval '1 hour' END,chip_monitor_lease=NULL,
 classification=CASE WHEN p_state='active' THEN 'Estoque' ELSE classification END,
 activation_state=CASE WHEN p_state='active' THEN 'active' ELSE activation_state END,
 activation_batch=CASE WHEN p_state='active' THEN coalesce(activation_batch,p_lease) ELSE activation_batch END,
 activation_at=CASE WHEN p_state='active' THEN now() ELSE activation_at END,
 chip_phone=CASE WHEN p_state='active' AND p_phone~'^\+?[0-9]{8,20}$' THEN p_phone ELSE chip_phone END,
 version=version+CASE WHEN p_state='active' THEN 1 ELSE 0 END
 WHERE w.id=p_id AND w.chip_monitor_lease=p_lease AND w.version=p_version AND w.classification='Reserva' AND w.kind='chip' AND w.status='Disponível' AND w.deleted_at IS NULL AND w.serial=p_result->>'iccid' AND w.chip_provider=p_result->>'provider';
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n=1;
END $$;
CREATE FUNCTION central_homologacao.warehouse_reserve_source(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE s chip_cost_snapshots; refresh boolean:=false;
BEGIN
 SELECT * INTO s FROM chip_cost_snapshots WHERE provider='arya' FOR UPDATE;
 IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
 IF (s.checked_at IS NULL OR s.checked_at<now()-interval '1 hour') AND (s.refresh_until IS NULL OR s.refresh_until<now()) AND (s.last_attempt IS NULL OR s.last_attempt<now()-interval '15 minutes') THEN
 UPDATE chip_cost_snapshots SET refresh_until=now()+interval '3 minutes',last_attempt=now() WHERE provider='arya';refresh:=true;
 END IF;
 RETURN jsonb_build_object('items',s.items,'checked_at',s.checked_at,'refresh',refresh);
END $$;
CREATE FUNCTION central_homologacao.warehouse_reserve_source_save(p_items jsonb,p_at timestamptz) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 UPDATE chip_cost_snapshots SET items=p_items,checked_at=p_at,last_error=NULL,refresh_until=NULL WHERE provider='arya' AND (checked_at IS NULL OR checked_at<=p_at)
$$;
ALTER TABLE central_homologacao.warehouse_items ADD COLUMN chip_link_result jsonb;
CREATE TABLE central_homologacao.warehouse_link_scan(id boolean PRIMARY KEY DEFAULT true CHECK(id),branch_index integer NOT NULL DEFAULT 1,page_skip integer NOT NULL DEFAULT 0,started_at timestamptz,completed_at timestamptz,due_at timestamptz NOT NULL DEFAULT now(),lease uuid,lease_until timestamptz,last_error text);
INSERT INTO central_homologacao.warehouse_link_scan(id) VALUES(true);
CREATE TABLE central_homologacao.warehouse_link_stage(branch text NOT NULL,serial text NOT NULL,iccid text NOT NULL,PRIMARY KEY(branch,serial));
CREATE INDEX warehouse_link_stage_iccid ON central_homologacao.warehouse_link_stage(iccid);
ALTER TABLE central_homologacao.warehouse_link_scan ENABLE ROW LEVEL SECURITY;
ALTER TABLE central_homologacao.warehouse_link_stage ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION central_homologacao.warehouse_links_claim(p_lease uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE s warehouse_link_scan; bases text[]:=ARRAY['imperatriz','araguaina','acailandia','maraba'];
BEGIN
 SELECT * INTO s FROM warehouse_link_scan WHERE id FOR UPDATE;
 IF s.due_at>now() OR s.lease_until>now() THEN RETURN NULL; END IF;
 IF s.started_at IS NULL THEN DELETE FROM warehouse_link_stage;UPDATE warehouse_link_scan SET started_at=now(),branch_index=1,page_skip=0 WHERE id;s.branch_index:=1;s.page_skip:=0;END IF;
 UPDATE warehouse_link_scan SET lease=p_lease,lease_until=now()+interval '3 minutes' WHERE id;
 RETURN jsonb_build_object('branch',bases[s.branch_index],'skip',s.page_skip);
END $$;
CREATE FUNCTION central_homologacao.warehouse_links_fail(p_lease uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 UPDATE warehouse_link_scan SET lease=NULL,lease_until=NULL,due_at=now()+interval '15 minutes',last_error='Consulta incompleta; vínculos anteriores preservados' WHERE id AND lease=p_lease
$$;
CREATE FUNCTION central_homologacao.warehouse_links_save(p_lease uuid,p_rows jsonb,p_more boolean,p_next integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE s warehouse_link_scan; bases text[]:=ARRAY['imperatriz','araguaina','acailandia','maraba'];
BEGIN
 SELECT * INTO s FROM warehouse_link_scan WHERE id FOR UPDATE;
 IF s.lease IS DISTINCT FROM p_lease OR s.lease_until<now() THEN RETURN false; END IF;
 IF p_more AND p_next<=s.page_skip THEN RAISE EXCEPTION 'Invalid pagination';END IF;
 -- Repeated equipment across pages aborts this cycle rather than overwriting evidence.
 INSERT INTO warehouse_link_stage(branch,serial,iccid) SELECT bases[s.branch_index],r.serial,CASE WHEN r.active THEN r.iccid ELSE '' END FROM jsonb_to_recordset(p_rows) r(serial text,iccid text,active boolean);
 IF p_more THEN UPDATE warehouse_link_scan SET page_skip=p_next,lease=NULL,lease_until=NULL WHERE id;
 ELSIF s.branch_index<4 THEN UPDATE warehouse_link_scan SET branch_index=branch_index+1,page_skip=0,lease=NULL,lease_until=NULL WHERE id;
 ELSE
 WITH matched AS (SELECT w.id,w.usage_device_serial,w.usage_branch,count(d.serial) AS n,min(d.serial) AS serial,min(d.branch) AS branch FROM warehouse_items w LEFT JOIN warehouse_link_stage d ON d.iccid=w.serial AND d.iccid<>'' WHERE w.kind='chip' AND w.deleted_at IS NULL GROUP BY w.id), evidence AS (
 SELECT id,jsonb_build_object('state',CASE WHEN n>1 THEN 'conflict' WHEN n=0 THEN 'not_found' WHEN usage_device_serial IS NOT NULL AND (usage_device_serial<>serial OR usage_branch IS DISTINCT FROM branch) THEN 'divergent' ELSE 'confirmed' END,'serial',CASE WHEN n=1 THEN serial END,'branch',CASE WHEN n=1 THEN branch END,'checked_at',now(),'source','API RS • quatro bases') AS result FROM matched)
 UPDATE warehouse_items w SET chip_link_result=e.result FROM evidence e WHERE w.id=e.id;
 UPDATE warehouse_link_scan SET completed_at=now(),started_at=NULL,due_at=now()+interval '1 day',lease=NULL,lease_until=NULL,last_error=NULL,branch_index=1,page_skip=0 WHERE id;
 END IF;RETURN true;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.warehouse_reserve_source(uuid),central_homologacao.warehouse_reserve_source_save(jsonb,timestamptz),central_homologacao.warehouse_links_claim(uuid),central_homologacao.warehouse_links_save(uuid,jsonb,boolean,integer),central_homologacao.warehouse_links_fail(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.warehouse_reserve_source(uuid),central_homologacao.warehouse_reserve_source_save(jsonb,timestamptz),central_homologacao.warehouse_links_claim(uuid),central_homologacao.warehouse_links_save(uuid,jsonb,boolean,integer),central_homologacao.warehouse_links_fail(uuid) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(65);
COMMIT;
