BEGIN;
ALTER TABLE central_homologacao.maintenance_snapshots ADD COLUMN refresh_lease uuid, ADD COLUMN refresh_lease_until timestamptz;
CREATE FUNCTION central_homologacao.maintenance_refresh_claim(p_branch text,p_lease uuid,p_force boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
BEGIN
 UPDATE central_homologacao.maintenance_snapshots SET refresh_lease=p_lease,refresh_lease_until=now()+interval '3 minutes'
 WHERE branch_id=p_branch AND (refresh_lease_until IS NULL OR refresh_lease_until<=now()) AND (p_force OR next_refresh<=now());
 RETURN FOUND;
END $$;
CREATE FUNCTION central_homologacao.maintenance_refresh_release(p_branch text,p_lease uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 UPDATE central_homologacao.maintenance_snapshots SET refresh_lease=NULL,refresh_lease_until=NULL,next_refresh=greatest(next_refresh,now()+interval '1 hour') WHERE branch_id=p_branch AND refresh_lease=p_lease
$$;
REVOKE ALL ON FUNCTION central_homologacao.maintenance_refresh_claim(text,uuid,boolean),central_homologacao.maintenance_refresh_release(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.maintenance_refresh_claim(text,uuid,boolean),central_homologacao.maintenance_refresh_release(text,uuid) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(61);
COMMIT;
