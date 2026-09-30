import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('BEGIN');
 const v=Number((await c.query('select max(version) v from central_homologacao.migrations')).rows[0].v);
 if(![19,20].includes(v))throw Error('Unexpected schema version');
 if(v===19)await c.query((await readFile(new URL('../migrations/020_api_v2_budget.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await c.query('SAVEPOINT checks');
 const id=randomUUID();
 await c.query("delete from central_homologacao.api_v2_leases where branch='imperatriz'");
 await c.query("delete from central_homologacao.api_v2_budget where branch='imperatriz'");
 assert.equal((await c.query("select central_homologacao.api_v2_claim('imperatriz',$1) n",[id])).rows[0].n,0);
 assert.ok((await c.query("select central_homologacao.api_v2_claim('imperatriz',$1) n",[randomUUID()])).rows[0].n>0);
 await c.query("update central_homologacao.api_v2_budget set next_at='-infinity' where branch='imperatriz'");
 assert.equal((await c.query("select central_homologacao.api_v2_claim('imperatriz',$1) n",[randomUUID()])).rows[0].n,0);
 await c.query("update central_homologacao.api_v2_budget set next_at='-infinity' where branch='imperatriz'");
 assert.ok((await c.query("select central_homologacao.api_v2_claim('imperatriz',$1) n",[randomUUID()])).rows[0].n>0);
 await c.query("select central_homologacao.api_v2_release('imperatriz',$1)",[id]);
 assert.equal((await c.query("select central_homologacao.api_v2_claim('imperatriz',$1) n",[randomUUID()])).rows[0].n,0);
 assert.equal((await c.query("select has_function_privilege('anon','central_homologacao.api_v2_claim(text,uuid)','execute') ok")).rows[0].ok,false);
 await c.query('ROLLBACK TO SAVEPOINT checks');
 await c.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({migration:20,applied:process.argv.includes('--apply'),tests:'spacing, two shared leases, release, public access denied; fixtures rolled back'}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
