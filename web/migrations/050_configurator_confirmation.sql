BEGIN;
-- Prepare inserts an idempotency receipt; save confirms only its response.
-- Keep request identity, fingerprint and creation time immutable to runtime.
GRANT UPDATE(response) ON central_homologacao.requests TO central_homologacao_web;
INSERT INTO central_homologacao.migrations(version) VALUES(50);
COMMIT;
