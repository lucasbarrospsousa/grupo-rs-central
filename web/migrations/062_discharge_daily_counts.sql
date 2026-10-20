BEGIN;
CREATE FUNCTION central_homologacao.discharge_daily_counts(p_branch text,p_month text)
RETURNS TABLE(day text,count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM central_homologacao.memberships m WHERE m.branch_id=p_branch AND m.user_id=nullif(current_setting('central.user_id',true),'')::uuid) THEN
  RAISE EXCEPTION 'Filial não autorizada' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Mês inválido' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT to_char(a.occurred_at at time zone 'America/Fortaleza','YYYY-MM-DD'),count(*)::integer
 FROM central_homologacao.audit_events a
 WHERE a.branch_id=p_branch AND a.action IN ('DISCHARGE','POST /api/install')
 AND a.occurred_at >= (to_date(p_month||'-01','YYYY-MM-DD')::timestamp at time zone 'America/Fortaleza')
 AND a.occurred_at < ((to_date(p_month||'-01','YYYY-MM-DD')+interval '1 month')::timestamp at time zone 'America/Fortaleza')
 GROUP BY 1 ORDER BY 1;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.discharge_daily_counts(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.discharge_daily_counts(text,text) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(62);
COMMIT;
