BEGIN;
CREATE TABLE central_homologacao.api_v2_budget (
 branch text PRIMARY KEY CHECK(branch IN ('imperatriz','araguaina','acailandia','maraba')),
 next_at timestamptz NOT NULL DEFAULT '-infinity'
);
CREATE TABLE central_homologacao.api_v2_leases (
 id uuid PRIMARY KEY, branch text NOT NULL REFERENCES central_homologacao.api_v2_budget(branch), expires_at timestamptz NOT NULL
);
REVOKE ALL ON central_homologacao.api_v2_budget,central_homologacao.api_v2_leases FROM PUBLIC,anon,authenticated;
CREATE FUNCTION central_homologacao.api_v2_claim(p_branch text,p_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
DECLARE due timestamptz; n integer; expiry timestamptz; t timestamptz;
BEGIN
 INSERT INTO api_v2_budget(branch) VALUES(p_branch) ON CONFLICT DO NOTHING;
 SELECT next_at INTO due FROM api_v2_budget WHERE branch=p_branch FOR UPDATE;
 t:=clock_timestamp();
 DELETE FROM api_v2_leases WHERE branch=p_branch AND expires_at<=t;
 SELECT count(*),min(expires_at) INTO n,expiry FROM api_v2_leases WHERE branch=p_branch;
 IF n>=2 THEN RETURN greatest(50,ceil(extract(epoch from expiry-t)*1000)::integer); END IF;
 IF due>t THEN RETURN greatest(50,ceil(extract(epoch from due-t)*1000)::integer); END IF;
 INSERT INTO api_v2_leases VALUES(p_id,p_branch,t+interval '25 seconds');
 UPDATE api_v2_budget SET next_at=t+interval '1100 milliseconds' WHERE branch=p_branch;
 RETURN 0;
END $$;
CREATE FUNCTION central_homologacao.api_v2_release(p_branch text,p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,central_homologacao AS $$
 DELETE FROM api_v2_leases WHERE branch=p_branch AND id=p_id
$$;
REVOKE ALL ON FUNCTION central_homologacao.api_v2_claim(text,uuid),central_homologacao.api_v2_release(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION central_homologacao.api_v2_claim(text,uuid),central_homologacao.api_v2_release(text,uuid) TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(20);
COMMIT;
