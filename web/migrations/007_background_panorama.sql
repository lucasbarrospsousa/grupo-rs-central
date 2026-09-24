BEGIN;
CREATE TABLE central_homologacao.platform_snapshots(branch_id text PRIMARY KEY REFERENCES central_homologacao.branches,cycle bigint NOT NULL,data jsonb NOT NULL,checked_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION central_homologacao.sync_panorama(p_branch text,p_cycle bigint DEFAULT NULL,p_data jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE result jsonb;
BEGIN
 IF p_data IS NOT NULL THEN INSERT INTO central_homologacao.platform_snapshots(branch_id,cycle,data) VALUES(p_branch,p_cycle,p_data) ON CONFLICT(branch_id) DO UPDATE SET cycle=excluded.cycle,data=excluded.data,checked_at=now();END IF;
 SELECT jsonb_build_object('cycle',cycle,'data',data,'checked_at',checked_at) INTO result FROM central_homologacao.platform_snapshots WHERE branch_id=p_branch;RETURN result;
END $$;
REVOKE ALL ON FUNCTION central_homologacao.sync_panorama(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.sync_panorama(text,bigint,jsonb) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(7);
COMMIT;
