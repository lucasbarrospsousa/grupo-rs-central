// Transactional validation: all synthetic data and schema changes are rolled back.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();let checks=0;
const check=(v)=>{assert.ok(v);checks++;};
try{
 await c.query('BEGIN');
 const sql=await readFile(new URL('../migrations/018_system_logs.sql',import.meta.url),'utf8');
 await c.query(sql.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 const actor=(await c.query("select id from central_homologacao.users where username='lucasabm'")).rows[0];
 await c.query("select set_config('central.user_id',$1,true)",[actor.id]);
 const id=randomUUID();await c.query("insert into central_homologacao.users(id,username,password_hash) values($1,$2,'private-hash-test')",[id,'audit-test-'+Date.now()]);
 await c.query('update central_homologacao.users set active=false where id=$1',[id]);
 let r=(await c.query("select * from central_homologacao.system_logs where module='users' order by id desc limit 1")).rows[0];
 check(r.username==='lucasabm');check(r.details.active.before===true&&r.details.active.after===false);check(!JSON.stringify(r).includes('private-hash-test'));
 check(!(await c.query("select has_table_privilege('central_homologacao_web','central_homologacao.system_logs','DELETE') as allowed")).rows[0].allowed);
 await c.query("insert into central_homologacao.system_logs(username,module,action,outcome) select 'TEST','logs','RETENTION','interface' from generate_series(1,10020)");
 check((await c.query('select count(*)::int n from central_homologacao.system_logs')).rows[0].n===10000);
 await c.query("insert into central_homologacao.system_logs(username,module,action,outcome,details) select 'TEST','logs','SIZE','interface',jsonb_build_object('summary',repeat('x',12000)) from generate_series(1,800)");
 const size=(await c.query('select count(*)::int n,sum(octet_length(to_jsonb(s)::text))::bigint bytes from central_homologacao.system_logs s')).rows[0];check(Number(size.bytes)<=8388608);check(size.n<10000);
 await c.query('ROLLBACK');console.log(JSON.stringify({checks,rollback:true,retention10000:true,byteBudget:true,redaction:true,immutableRuntime:true}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
