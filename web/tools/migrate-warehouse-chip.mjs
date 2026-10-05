import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';import {businessMutation} from '../backend/business.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('BEGIN');await c.query("select pg_advisory_xact_lock(hashtext('warehouse-chip-migration'))");
 const version=Number((await c.query('select max(version) v from central_homologacao.migrations')).rows[0].v);
 if(version!==27&&version!==28)throw Error('Unexpected migration version '+version);
 if(version===27)await c.query((await readFile(new URL('../migrations/028_warehouse_chip_provider.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await c.query('SAVEPOINT verify');
 for(const [i,provider] of ['arya','link'].entries()){
  const serial='89999'+String(Date.now())+i;
  const saved=await businessMutation(c,{path:'/api/warehouse',method:'POST',branch:'imperatriz',role:'admin',body:{kind:'chip',serial,provider,operator:'forged'},service:{carrier:async()=>({ok:true,provider,iccid:serial,operator:'VIVO',phone:'99999999999'})}});
  const row=(await c.query('select chip_provider,chip_operator,chip_phone from central_homologacao.warehouse_items where id=$1',[saved.id])).rows[0];
  assert.deepEqual(row,{chip_provider:provider,chip_operator:'VIVO',chip_phone:'99999999999'});
 }
 await c.query('ROLLBACK TO SAVEPOINT verify');await c.query('COMMIT');console.log('Migration 28 ready; both providers saved and read; synthetic entries rolled back.');
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
