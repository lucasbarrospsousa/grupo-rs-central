import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),client=await pool.connect();
try{
 await client.query('BEGIN');
 const version=Number((await client.query('select max(version) version from central_homologacao.migrations')).rows[0].version);
 if(![18,19].includes(version))throw Error('Unexpected migration version');
 if(version===18)await client.query((await readFile(new URL('../migrations/019_automation_usage.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await client.query('SAVEPOINT verification');
 await client.query('select central_homologacao.configure_automation(false,5)');
 assert.equal((await client.query('select central_homologacao.dispatch_sync() result')).rows[0].result,null);
 assert.deepEqual((await client.query('select central_homologacao.sync_claim(gen_random_uuid()) result')).rows[0].result.rows,[]);
 for(const minutes of [5,10,30,1440]){
  await client.query('select central_homologacao.configure_automation(true,$1)',[minutes]);
  await client.query('update central_homologacao.sync_control set last_tick=now(),lease_until=null,next_cycle_at=null where id');
  assert.equal((await client.query('select central_homologacao.dispatch_sync() result')).rows[0].result,null);
  assert.deepEqual((await client.query('select central_homologacao.sync_claim(gen_random_uuid()) result')).rows[0].result.rows,[]);
 }
 assert.equal((await client.query("select has_function_privilege('central_homologacao_web','central_homologacao.record_query_usage(text,jsonb)','EXECUTE') ok")).rows[0].ok,true);
 await client.query(`select central_homologacao.record_query_usage('page','[{"source":"api","total":2,"failed":1}]')`);
 const data=(await client.query('select central_homologacao.automation_status() data')).rows[0].data;
 assert.ok(data.usage.some(r=>r.source==='api'&&r.mode==='page'&&Number(r.total)>=2));
 await client.query('ROLLBACK TO SAVEPOINT verification');
 await client.query('COMMIT');
 console.log(JSON.stringify({migration:19,tests:'pause, four intervals, direct-call guard, runtime aggregation and access passed; test changes rolled back'}));
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();}
