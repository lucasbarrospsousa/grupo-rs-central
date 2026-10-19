import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 const exists=(await c.query('select 1 from central_homologacao.migrations where version=61')).rowCount;
 if(exists){console.log('Migração 61 já aplicada.');}
 else{
 const sql=await readFile(new URL('../migrations/061_maintenance_refresh_gate.sql',import.meta.url),'utf8');
 await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'').replace(/^/,'BEGIN;'));
 const branch=(await c.query('select branch_id from central_homologacao.maintenance_snapshots order by branch_id limit 1')).rows[0].branch_id;
 const a=randomUUID(),b=randomUUID();
 assert.equal((await c.query('select central_homologacao.maintenance_refresh_claim($1,$2,true) as ok',[branch,a])).rows[0].ok,true);
 assert.equal((await c.query('select central_homologacao.maintenance_refresh_claim($1,$2,true) as ok',[branch,b])).rows[0].ok,false);
 await c.query('select central_homologacao.maintenance_refresh_release($1,$2)',[branch,a]);
 assert.equal((await c.query('select central_homologacao.maintenance_refresh_claim($1,$2,false) as ok',[branch,b])).rows[0].ok,false);
 await c.query('ROLLBACK');
 await c.query(sql);console.log('Migração 61 aplicada; trava e intervalo validados em transação revertida. Nenhuma API externa consultada.');
 }
} catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
