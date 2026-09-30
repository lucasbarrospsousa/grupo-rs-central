BEGIN;
-- Add only a lookup hint to the existing job; schedules and leases stay intact.
DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('central_homologacao.sync_claim(uuid)'::regprocedure) INTO definition;
 IF position('d.data->>''plate'' AS plate' in definition)=0 THEN
  IF position('d.branch_id AS branch,d.serial FROM' in definition)=0 THEN RAISE EXCEPTION 'Unexpected sync_claim definition'; END IF;
  EXECUTE replace(definition,'d.branch_id AS branch,d.serial FROM','d.branch_id AS branch,d.serial,d.data->>''plate'' AS plate FROM');
 END IF;
END $$;
INSERT INTO central_homologacao.migrations(version) VALUES(23) ON CONFLICT DO NOTHING;
COMMIT;
