// Real SQL in one rolled-back transaction; platform calls are simulated.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID,randomInt} from 'node:crypto';
import {createPool} from '../backend/database.mjs';
import {configuratorOperation} from '../backend/configurator.mjs';
import {devicePage} from '../backend/device-page.mjs';
const admin=createPool({admin:true});
let uid;try{uid=(await admin.query("select user_id from central_homologacao.memberships where role in ('admin','operator') group by user_id having count(distinct branch_id)=4 limit 1")).rows[0]?.user_id;}finally{await admin.end();}
assert.ok(uid,'Authorized four-branch test context required');
const runtime=process.argv.includes('--runtime');
const pool=createPool({admin:!runtime}),c=await pool.connect();
let calls=0,passed=0;
const adapter={connect:async()=>({release(){},query:(sql,args)=>c.query(sql==='BEGIN'?'SAVEPOINT operation':sql==='COMMIT'?'RELEASE SAVEPOINT operation':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT operation':sql,args)})};
try{
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='3s'");await c.query("SET LOCAL statement_timeout='15s'");
 if(!runtime && !(await c.query('select 1 from central_homologacao.migrations where version=58')).rowCount)await c.query((await readFile(new URL('../migrations/058_configurator_transfer.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await c.query("select set_config('central.user_id',$1,true)",[uid]);
 const serial=String(randomInt(700000000,799999999)),id=randomUUID(),iccid='89'+String(randomInt(100000000,999999999))+String(randomInt(100000000,999999999));
 assert.equal((await c.query("select 1 from central_homologacao.devices where serial=$1 or data->>'iccid'=$2",[serial,iccid])).rowCount,0);
 await c.query("insert into central_homologacao.devices(id,branch_id,serial,data) values($1,'acailandia',$2,$3)",[id,serial,{status:'Instalado',plate:'TEST000',client:'Synthetic origin',model:'V7.3.5',iccid,owner_binding:{client:'Synthetic origin'},remote_vehicle_id:'old-platform'}]);
 if(!runtime)await c.query("insert into central_homologacao.device_observations(device_id,branch_id,cycle,data) values($1,'acailandia',0,$2)",[id,{location:{ok:true},chip:{ok:true}}]);
 await c.query("select set_config('central.user_id',$1,true)",[uid]);
 const user={user_id:uid},service={equipmentPortal:async(branch,s)=>{calls++;return {serial:s,iccid,phone:'99999999999'};}};
 let branch='imperatriz',version=1;
 for(const destination of ['imperatriz','araguaina','maraba','acailandia']){
  branch=destination;const p={action:'save',branch,serial,iccid,phone:'99999999999',operator:'CLARO',version,key:randomUUID()};
  const before=(await c.query('select branch_id,data from central_homologacao.devices where id=$1',[id])).rows[0];
  const cursor=(await c.query('select revision::text from central_homologacao.read_clock')).rows[0].revision;
  assert.equal((await configuratorOperation(adapter,user,{...p,action:'preflight'},service)).version,version);
  const prepared=await configuratorOperation(adapter,user,{...p,action:'prepare'},service);assert.equal(prepared.pending,true);
  const priorCalls=calls;
  await assert.rejects(configuratorOperation(adapter,user,p,{equipmentPortal:async()=>({serial:'mismatch'})}),e=>e.status===409);
  assert.equal((await c.query('select branch_id from central_homologacao.devices where id=$1',[id])).rows[0].branch_id,before.branch_id);
  const done=await configuratorOperation(adapter,user,p,service);assert.equal(done.transferred,true);assert.equal(done.previous_branch,before.branch_id);assert.equal(done.id,id);
  assert.equal(done.status,branch==='imperatriz'?'Reserva':'Estoque');version=done.version;
  assert.deepEqual(await configuratorOperation(adapter,user,p,service),done);assert.equal(calls,priorCalls+1);
  const row=(await c.query('select data from central_homologacao.devices where id=$1',[id])).rows[0].data;
  assert.equal(row.plate,'');assert.equal(row.client,'');assert.equal(row.owner_binding,undefined);assert.equal(row.remote_vehicle_id,undefined);
  const query=new URLSearchParams({scope:'page',query:serial,since:cursor});
  const origin=await devicePage(c,before.branch_id,query),target=await devicePage(c,branch,query);
  assert.equal(origin.rows.length,0);assert.equal(target.rows.length,1);assert.equal(target.rows[0].id,id);
  passed++;if(!runtime)assert.equal((await c.query("select count(*)::int as n from central_homologacao.audit_events where entity_id=$1 and action='RS300_CONFIGURATOR_TRANSFER'",[id])).rows[0].n,2*passed);
 }
 if(!runtime)assert.equal((await c.query("select details->'observation'->'data'->'location'->>'ok' as ok from central_homologacao.audit_events where entity_id=$1 and action='RS300_CONFIGURATOR_TRANSFER' and details->>'previousVersion'='1' limit 1",[id])).rows[0].ok,'true');
 assert.equal((await c.query('select 1 from central_homologacao.device_observations where device_id=$1',[id])).rowCount,0);
 // A fresh attempt with an old version cannot overwrite the successful transfer.
 await assert.rejects(configuratorOperation(adapter,{user_id:uid},{action:'save',branch:'imperatriz',serial,iccid,phone:'99999999999',operator:'CLARO',version:1,key:randomUUID()},service),e=>e.status===409);
 console.log(`PASS SQL rollback (${runtime?'runtime RLS':'admin + observation archive'}): 4 destination branches, remote mismatch, prepare, transfer, history, cleared bindings, both paginated lists, replay and stale version.`);
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
