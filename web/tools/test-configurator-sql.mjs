// Disposable SQL records; remote platform mocked. Never touches serial hardware.
import assert from 'node:assert/strict';import {randomUUID,randomInt} from 'node:crypto';
import {createPool} from '../backend/database.mjs';import {configuratorOperation} from '../backend/configurator.mjs';
const admin=createPool({admin:true}),runtime=createPool(),uid=randomUUID(),user={user_id:uid},ids=[];let enabled,count=0;
const pass=message=>{count++;console.log('PASS '+message);};
const serial=()=> '024'+String(randomInt(100000,999999));
const service={equipmentPortal:async(_branch,s)=>({serial:s,iccid:'8955000000000000001',phone:'99999999999'})};
try{
 enabled=(await admin.query('select enabled from central_homologacao.sync_control where id')).rows[0].enabled;
 await admin.query('update central_homologacao.sync_control set enabled=false where id');
 await admin.query('insert into central_homologacao.users(id,username,password_hash,active) values($1,$2,$3,false)',[uid,'qa-configurator-'+uid,'no-login']);
 for(const branch of ['imperatriz','araguaina','acailandia','maraba'])await admin.query("insert into central_homologacao.memberships values($1,$2,'operator')",[uid,branch]);
 for(const branch of ['imperatriz','araguaina','acailandia','maraba']){
  let s;do{s=serial();}while((await admin.query('select 1 from central_homologacao.devices where serial=$1',[s])).rowCount);
  const p={branch,serial:s,action:'save',iccid:'8955000000000000001',phone:'99999999999',operator:'CLARO',version:0,key:randomUUID()};
  assert.equal((await configuratorOperation(runtime,user,{...p,action:'preflight'})).version,0);
  const results=await Promise.all([configuratorOperation(runtime,user,p,service),configuratorOperation(runtime,user,p,service)]);const r=results[0];ids.push(r.id);assert.deepEqual(results[1],r);assert.equal(r.status,branch==='imperatriz'?'Reserva':'Estoque');pass(branch+' creates the expected status');
  assert.deepEqual(await configuratorOperation(runtime,user,p,service),r);pass(branch+' replay returns the same receipt');
  await assert.rejects(configuratorOperation(runtime,user,{...p,operator:'TIM'},service),e=>e.status===409);
  await assert.rejects(configuratorOperation(runtime,user,{...p,branch:branch==='maraba'?'imperatriz':'maraba',action:'preflight'},service),e=>e.status===409);pass(branch+' rejects payload reuse and cross-branch transfer');
  if(branch==='imperatriz'){
   await admin.query("update central_homologacao.devices set data=data||'{\"status\":\"Instalado\"}'::jsonb,version=version+1 where id=$1",[r.id]);
   await assert.rejects(configuratorOperation(runtime,user,{...p,key:randomUUID(),version:1},service),e=>e.status===409);pass('stale version rejected');
   const changed=await configuratorOperation(runtime,user,{...p,key:randomUUID(),version:2},service);assert.equal(changed.status,'Manutenção');assert.equal((await admin.query('select count(*)::int n from central_homologacao.visits where device_id=$1',[r.id])).rows[0].n,1);pass('Imperatriz reconfiguration records maintenance');
  }else{
   await admin.query("update central_homologacao.devices set data=data||'{\"status\":\"Instalado\"}'::jsonb where id=$1",[r.id]);
   await assert.rejects(configuratorOperation(runtime,user,{...p,action:'preflight'},service),e=>e.status===409);pass('regional installed device blocked');
  }
  await admin.query('delete from central_homologacao.visits where device_id=$1',[r.id]);await admin.query('delete from central_homologacao.devices where id=$1',[r.id]);ids.pop();
 }
 let s;do{s=serial();}while((await admin.query('select 1 from central_homologacao.devices where serial=$1',[s])).rowCount);
 await assert.rejects(configuratorOperation(runtime,user,{branch:'imperatriz',serial:s,action:'save',iccid:'8955000000000000001',phone:'99999999999',operator:'CLARO',version:0,key:randomUUID()},{equipmentPortal:async()=>({serial:s,iccid:'8955000000000000002',phone:'99999999999'})}),e=>e.status===409);pass('remote mismatch blocks SQL write');
 console.log('Configurator SQL checks: '+count);
}finally{
 if(ids.length){await admin.query('delete from central_homologacao.visits where device_id=any($1::uuid[])',[ids]);await admin.query('delete from central_homologacao.devices where id=any($1::uuid[])',[ids]);}
 await admin.query('delete from central_homologacao.audit_events where user_id=$1',[uid]);await admin.query('delete from central_homologacao.requests where user_id=$1',[uid]);await admin.query('delete from central_homologacao.users where id=$1',[uid]);
 if(enabled!==undefined)await admin.query('update central_homologacao.sync_control set enabled=$1 where id',[enabled]);
 await runtime.end();await admin.end();
}
