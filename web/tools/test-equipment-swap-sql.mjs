import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
import {equipmentSwap} from '../backend/equipment-swap.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('begin');
 if(!(await c.query('select 1 from central_homologacao.migrations where version=41')).rowCount){const sql=await readFile(new URL('../migrations/041_equipment_swap.sql',import.meta.url),'utf8');await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));}
 if(!(await c.query('select 1 from central_homologacao.migrations where version=42')).rowCount){const sql=await readFile(new URL('../migrations/042_installed_binding_priority.sql',import.meta.url),'utf8');await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));}
 const actor=(await c.query("select id from central_homologacao.users where username='lucasabm' and active")).rows[0];assert.ok(actor);
 await c.query("select set_config('central.user_id',$1,true)",[actor.id]);
 await c.query('savepoint fixtures');
 // All fixtures and API outcomes are simulated. No external writes.
 const branch='imperatriz',ids=[],serials=[];
 for(const [i,status] of ['Instalado','Estoque','Reserva','Manutenção'].entries()){
  const id=randomUUID(),serial='998'+String(Date.now())+i;ids.push(id);serials.push(serial);
  await c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,branch,serial,{status,plate:'OLD',identification:'OLD'}]);
  await c.query('select central_homologacao.capture_device_codes($1,$2,$3)',[branch,serial,{state:'divergent',equipment_id:String(990000+i),vehicle_id:String(991000+i),api_plate:'NEW'}]);
  const d=(await c.query('select data from central_homologacao.devices where id=$1',[id])).rows[0].data;assert.equal(d.plate,i===0?'NEW':'OLD');assert.equal(d.status,status);
  await c.query('select central_homologacao.capture_device_codes($1,$2,$3)',[branch,serial,{state:'error',message:'Simulated access failure'}]);
  assert.equal((await c.query('select data from central_homologacao.devices where id=$1',[id])).rows[0].data.plate,i===0?'NEW':'OLD');
 }
 const snapshot={incoming:{serial:serials[1],id:'990001',vehicle_id:'991001',plate:'XRS-450'},outgoing:{serial:serials[0],id:'990000',vehicle_id:'991000',plate:'ABC1D23'},client:'Teste',model:'Teste'};
 let phase='original',sends=0,failReturn=false;
 const service={swapEquipment:async(b,serial)=>{assert.equal(b,branch);const x=serial===snapshot.incoming.serial?snapshot.incoming:snapshot.outgoing,isIn=serial===snapshot.incoming.serial;return {...x,serial,binding_known:true,vehicle_id:phase==='original'?x.vehicle_id:isIn?snapshot.outgoing.vehicle_id:phase==='partial'?'':snapshot.incoming.vehicle_id,plate:phase==='original'?x.plate:isIn?snapshot.outgoing.plate:phase==='partial'?'':snapshot.incoming.plate};},swapAssociate:async(b,v,e,move)=>{sends++;if(move)phase='partial';else {if(failReturn)throw Error('Timeout');phase='complete';}return {ok:true};},api:async()=>({veiculo:{CodVeiculo:991001,Placa:'XRS-450'},equipamento:null})};
 // Nested scoped operations run inside the outer rollback-only fixture transaction.
 const client={query:(sql,args)=>['BEGIN','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[],rowCount:0}):c.query(sql,args),release(){}};
 const fixturePool={connect:async()=>client};
 async function operation(){const id=randomUUID();await c.query("insert into central_homologacao.equipment_swaps(id,branch_id,user_id,snapshot,phase) values($1,$2,$3,$4,'preview')",[id,branch,actor.id,snapshot]);return id;}
 const args={pool:fixturePool,user:{user_id:actor.id},branch,service,action:'execute'};
 const id=await operation();assert.equal((await equipmentSwap({...args,body:{id}})).ok,true);assert.equal(sends,2);
 assert.equal((await equipmentSwap({...args,body:{id}})).ok,true);assert.equal(sends,2,'Replay must not resend');
 const final=(await c.query('select serial,data from central_homologacao.devices where id=any($1::uuid[])',[ids.slice(0,2)])).rows;
 assert.equal(final.find(x=>x.serial===serials[0]).data.status,'Manutenção');assert.equal(final.find(x=>x.serial===serials[1]).data.status,'Instalado');
 phase='original';failReturn=true;const partial=await operation();const r=await equipmentSwap({...args,body:{id:partial}});assert.equal(r.pending,true);const count=sends;
 await equipmentSwap({...args,body:{id:partial}});assert.equal(sends,count,'Uncertain return must not be repeated');
 // A later read can confirm a previously timed-out return.
 phase='complete';assert.equal((await equipmentSwap({...args,body:{id:partial}})).ok,true);assert.equal(sends,count);
 await c.query('rollback to savepoint fixtures');
 console.log('PASS: installed-only reconciliation, failed reads preserve data, complete swap, idempotent replay, partial timeout and read-only recovery. All fixtures rolled back.');
 await c.query(process.argv.includes('--apply')?'commit':'rollback');console.log('Migration applied: '+process.argv.includes('--apply'));
}catch(e){await c.query('rollback');throw e;}finally{c.release();await pool.end();}
