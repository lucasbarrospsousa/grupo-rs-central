import pg from 'pg';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const privateRoot = new URL('../../.secrets/homologacao/', import.meta.url);
export const schema = 'central_homologacao';
export function connectionOptions({ admin = false } = {}) {
  const runtime = admin ? null : JSON.parse(readFileSync(new URL('runtime-db.json', privateRoot), 'utf8'));
  return {
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432, database: 'postgres',
    user: admin ? 'postgres.vwiayytzmorcjeaszowg' : runtime.user,
    password: admin ? readFileSync(new URL('database-password.txt', privateRoot), 'utf8').trim() : runtime.password,
    ssl: { rejectUnauthorized: true, ca: readFileSync(new URL('supabase-ca.crt', privateRoot), 'utf8') },
    connectionTimeoutMillis: 10000, statement_timeout: 20000,
    application_name: admin ? 'central-homologacao-migration' : 'central-homologacao-web'
  };
}
export const privatePath = name => fileURLToPath(new URL(name, privateRoot));
export function createPool(options) { return new pg.Pool({ ...connectionOptions(options), max: 4, idleTimeoutMillis: 10000 }); }
