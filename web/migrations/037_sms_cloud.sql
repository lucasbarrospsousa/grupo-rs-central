BEGIN;
ALTER TABLE central_homologacao.sms_bridge_status ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION central_homologacao.preserve_cloud_sms_health() RETURNS trigger LANGUAGE plpgsql AS $gate$
BEGIN
 IF OLD.details->>'mode'='cloud' AND coalesce(current_setting('central.sms_cloud',true),'')<>'on' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $gate$;
REVOKE ALL ON FUNCTION central_homologacao.preserve_cloud_sms_health() FROM PUBLIC;
DROP TRIGGER IF EXISTS preserve_cloud_health ON central_homologacao.sms_bridge_status;
CREATE TRIGGER preserve_cloud_health BEFORE UPDATE ON central_homologacao.sms_bridge_status FOR EACH ROW EXECUTE FUNCTION central_homologacao.preserve_cloud_sms_health();
INSERT INTO central_homologacao.migrations(version) VALUES(37) ON CONFLICT DO NOTHING;
COMMIT;
