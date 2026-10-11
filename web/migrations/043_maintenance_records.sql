BEGIN;
-- Extend identity acceptance for explicit historical records, preserving every previous rule.
DO $migration$
DECLARE previous text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO previous FROM pg_constraint WHERE conrelid='central_homologacao.visits'::regclass AND conname='visit_historical_identity';
 IF previous IS NULL OR previous NOT LIKE 'CHECK (%' THEN RAISE EXCEPTION 'Unexpected maintenance identity constraint'; END IF;
 ALTER TABLE central_homologacao.visits DROP CONSTRAINT visit_historical_identity;
 EXECUTE format('ALTER TABLE central_homologacao.visits ADD CONSTRAINT visit_historical_identity CHECK (%s OR ((branch_id = ''imperatriz'' AND data->>''visit_version'' = ''3'' AND data->>''identity_source'' IN (''manual'',''selected'') AND data->>''currentSerial'' ~ ''^[0-9]{6,17}$'' AND length(coalesce(data->>''client'','''')) > 0 AND length(coalesce(data->>''plate'','''')) > 0) IS TRUE))',substring(previous from 7));
END $migration$;
INSERT INTO central_homologacao.migrations(version) VALUES(43);
COMMIT;
