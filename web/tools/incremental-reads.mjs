import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
import {incrementalRead} from '../backend/incremental-read.mjs';
const mode=process.argv[2];if(!['test','deploy','status'].includes(mode))throw Error('Use test/deploy/status');
const pool=createPool({admin:true}),c=await pool.connect();
try{
 if(mode==='status'){console.log(JSON.stringify((await c.query('select revision::text,(select count(*) from central_homologacao.read_changes) as markers from central_homologacao.read_clock')).rows));}
 else {
  await c.query('BEGIN');
  if(!(await c.query('select 1 from central_homologacao.migrations where version=57')).rowCount)await c.query((await readFile(new URL('../migrations/057_incremental_reads.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
  if(mode==='deploy'){await c.query('COMMIT');console.log('Migration 57 applied; existing data preserved.');}
  else {
   const uid=(await c.query("select u.id from central_homologacao.users u join central_homologacao.memberships m on m.user_id=u.id where m.role='admin' and m.branch_id='imperatriz' limit 1")).rows[0].id;
   await c.query("select set_config('central.user_id',$1,true)",[uid]);
   const id=randomUUID(),wid=randomUUID(),serial='999'+String(Date.now()).slice(-9);
   const cursor=async()=>(await c.query('select revision::text from central_homologacao.read_clock')).rows[0].revision;
   const start=await cursor();
   await c.query("insert into central_homologacao.devices(id,branch_id,serial,data) values($1,'imperatriz',$2,'{\"status\":\"Estoque\"}')",[id,serial]);
   let data=await incrementalRead(c,'imperatriz','devices',start);assert.deepEqual(data.rows.map(x=>x.id),[id]);
   const beforeNoop=await cursor();await c.query('update central_homologacao.devices set data=data where id=$1',[id]);assert.equal(await cursor(),beforeNoop);
   await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at,usage_device_serial,usage_branch) values($1,'imperatriz','device',$2,'Disponível',now(),$2,'imperatriz')",[wid,serial]);
   const beforeUpdate=await cursor();await c.query("update central_homologacao.devices set data=data||'{\"iccid\":\"89550000000000000001\"}',version=version+1 where id=$1",[id]);
   const related=await incrementalRead(c,'imperatriz','warehouse',beforeUpdate);assert.ok(related.rows.some(x=>x.id===wid));
   const beforeDelete=await cursor();await c.query('update central_homologacao.devices set deleted_at=now(),version=version+1 where id=$1',[id]);
   data=await incrementalRead(c,'imperatriz','devices',beforeDelete);assert.ok(data.removed.includes(id));
   const beforeMove=await cursor();await c.query("update central_homologacao.devices set deleted_at=null,branch_id='araguaina' where id=$1",[id]);
   assert.ok((await incrementalRead(c,'imperatriz','devices',beforeMove)).removed.includes(id));
   assert.ok((await incrementalRead(c,'araguaina','devices',beforeMove)).rows.some(x=>x.id===id));
   assert.equal((await c.query("select 1 from pg_policies where schemaname='central_homologacao' and tablename='read_changes' and policyname='read_changes_member'")).rowCount,1);
   await c.query('ROLLBACK');console.log('PASS rollback: inserts, no-op, derived warehouse, deletions, branch transfer and RLS policy. No operational data persisted.');
  }
 }
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
