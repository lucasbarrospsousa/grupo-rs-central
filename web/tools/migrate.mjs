import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createPool, privatePath } from '../backend/database.mjs';
const pool = createPool({admin:true});
try {
  const existing = await pool.query("select to_regnamespace('central_homologacao') as existing");
  if (!existing.rows[0].existing) await pool.query(readFileSync(new URL('../migrations/001_homologacao.sql',import.meta.url),'utf8'));
  else if (![1,2,3,4,5,6,7,9].includes((await pool.query('select max(version) as version from central_homologacao.migrations')).rows[0].version)) throw Error('Unexpected schema version');
  const file=privatePath('runtime-db.json');
  if (!existsSync(file)) {
    if ((await pool.query("select 1 from pg_roles where rolname='central_homologacao_web'")).rowCount) throw Error('Runtime role already exists; credential recovery required');
    const password=randomBytes(40).toString('hex');
    await pool.query(`CREATE ROLE central_homologacao_web LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    writeFileSync(file,JSON.stringify({user:'central_homologacao_web.vwiayytzmorcjeaszowg',password}),{flag:'wx'});
  }
  await pool.query(`GRANT USAGE ON SCHEMA central_homologacao TO central_homologacao_web;
    GRANT SELECT ON central_homologacao.branches,central_homologacao.users,central_homologacao.memberships TO central_homologacao_web;
    GRANT UPDATE(password_hash) ON central_homologacao.users TO central_homologacao_web;
    GRANT SELECT,INSERT,UPDATE ON central_homologacao.devices TO central_homologacao_web;
    GRANT SELECT,INSERT,DELETE ON central_homologacao.sessions TO central_homologacao_web;
    GRANT SELECT,INSERT ON central_homologacao.requests TO central_homologacao_web;
    GRANT INSERT ON central_homologacao.audit_events TO central_homologacao_web;
    GRANT USAGE ON SEQUENCE central_homologacao.audit_events_id_seq TO central_homologacao_web;`);
  for(const [version,name] of [[2,'002_warehouse.sql'],[3,'003_maintenance.sql'],[4,'004_integrations.sql'],[5,'005_login_limits.sql'],[6,'006_background_sync.sql'],[7,'007_background_panorama.sql'],[9,'009_sms_bridge.sql']]){
    if(!(await pool.query('select 1 from central_homologacao.migrations where version=$1',[version])).rowCount)await pool.query(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  }
  console.log('Migrations ready; runtime role isolated; no public/anon grants.');
} finally { await pool.end(); }
