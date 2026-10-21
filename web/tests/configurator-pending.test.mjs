import test from 'node:test';import assert from 'node:assert/strict';
import {configuratorOperation,configuredData} from '../backend/configurator.mjs';
const p={branch:'imperatriz',serial:'040999991',action:'prepare',iccid:'8955000000000000001',phone:'99999999999',operator:'CLARO',version:0,key:'11111111-1111-1111-1111-111111111111'};
function fixture(){
 const state={requests:new Map(),device:null,deviceWrites:0,remoteCalls:0,role:'operator'};
 const client={release(){},async query(sql,a=[]){
  const rows=x=>({rows:x,rowCount:x.length});
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('select set_config')||sql.startsWith('select pg_advisory'))return rows([]);
  if(sql.startsWith('select role'))return rows(state.role?[{role:a[1]===p.branch?state.role:(state.originRole||state.role)}]:[]);
  if(sql.startsWith('select fingerprint'))return rows(state.requests.has(a[1])?[state.requests.get(a[1])]:[]);
  if(sql.startsWith('select id,branch_id,serial'))return rows(state.device?[state.device]:[]);
  if(sql.startsWith('insert into central_homologacao.requests')){state.requests.set(a[1],{fingerprint:a[2],response:a[3]});return rows([]);}
  if(sql.startsWith('select id from central_homologacao.devices'))return rows([]);
  if(sql.startsWith('insert into central_homologacao.devices')){state.device={id:a[0],branch_id:a[1],serial:a[2],data:a[3],version:1};state.deviceWrites++;return rows([]);}
  if(sql.startsWith('insert into central_homologacao.audit_events'))return rows([]);
  if(sql.startsWith('update central_homologacao.devices')){state.device={...state.device,data:a[0],version:state.device.version+1,branch_id:a[3]};state.deviceWrites++;return rows([{version:state.device.version}]);}
  if(sql.startsWith('insert into central_homologacao.visits'))return rows([]);
  if(sql.startsWith('select data,version'))return rows([state.device]);
  if(sql.includes('warehouse_items'))return rows([]);
  throw Error('Unexpected SQL: '+sql);
 }};
 return {state,pool:{connect:async()=>client},service:{equipmentPortal:async()=>{state.remoteCalls++;return {serial:p.serial,iccid:p.iccid,phone:p.phone};}}};
}
test('prepare stores pending without devices or platform calls; save confirms and retry is idempotent',async()=>{
 const f=fixture(),user={user_id:'synthetic'};
 const pending=await configuratorOperation(f.pool,user,p,f.service);
 assert.equal(pending.pending,true);assert.equal(pending.confirmed,false);assert.equal(f.state.deviceWrites,0);assert.equal(f.state.remoteCalls,0);
 assert.deepEqual(await configuratorOperation(f.pool,user,p,f.service),pending);assert.equal(f.state.requests.size,1);
 const saved=await configuratorOperation(f.pool,user,{...p,action:'save'},f.service);
 assert.equal(saved.confirmed,true);assert.equal(f.state.deviceWrites,1);
 assert.deepEqual(await configuratorOperation(f.pool,user,{...p,action:'save'},f.service),saved);
 assert.deepEqual(await configuratorOperation(f.pool,user,p,f.service),saved);
 assert.equal(f.state.deviceWrites,1);assert.equal(f.state.remoteCalls,1);
});
test('platform mismatch retains pending and never writes device; incompatible retry rejected',async()=>{
 const f=fixture(),user={user_id:'synthetic'};await configuratorOperation(f.pool,user,p,f.service);
 await assert.rejects(configuratorOperation(f.pool,user,{...p,action:'save'},{equipmentPortal:async()=>({serial:'wrong'})}),e=>e.status===409);
 assert.equal(f.state.deviceWrites,0);assert.equal(f.state.requests.get(p.key).response.pending,true);
 await assert.rejects(configuratorOperation(f.pool,user,{...p,phone:'88888888888'},f.service),e=>e.status===409);
});
test('prepare preserves branch and version checks',async()=>{
 const f=fixture(),user={user_id:'synthetic'};
 f.state.role='reader';await assert.rejects(configuratorOperation(f.pool,user,p,f.service),e=>e.status===403);
 f.state.role='operator';f.state.originRole='reader';f.state.device={branch_id:'maraba',version:0,data:{}};await assert.rejects(configuratorOperation(f.pool,user,p,f.service),e=>e.status===403);
 f.state.device={branch_id:'imperatriz',version:2};await assert.rejects(configuratorOperation(f.pool,user,p,f.service),e=>e.status===409);
 assert.equal(f.state.requests.size,0);
});

test('explicit status applies to existing installed devices in every branch, keeps links and prevents replay changes',async()=>{
 for(const branch of ['imperatriz','araguaina','acailandia','maraba'])for(const status of ['Estoque','Reserva','Instalado','Manutenção']){
  const f=fixture(),user={user_id:'synthetic'},request={...p,branch,status,version:1,action:'save'};
  f.state.device={id:'synthetic',branch_id:branch,serial:p.serial,version:1,data:{status:'Instalado',plate:'ABC1D23',client:'Fixture',installed_at:'2026-01-01'}};
  const preflight=await configuratorOperation(f.pool,user,{action:'preflight',branch,serial:p.serial,status},f.service);assert.equal(preflight.exists,true);
  const saved=await configuratorOperation(f.pool,user,request,f.service);assert.equal(saved.status,status);assert.equal(f.state.device.data.plate,'ABC1D23');assert.equal(f.state.device.data.client,'Fixture');assert.equal(f.state.device.data.stock,status==='Estoque'?1:0);
  assert.deepEqual(await configuratorOperation(f.pool,user,request,f.service),saved);assert.equal(f.state.deviceWrites,1);
  await assert.rejects(configuratorOperation(f.pool,user,{...request,status:status==='Reserva'?'Estoque':'Reserva'},f.service),e=>e.status===409);
 }
});
