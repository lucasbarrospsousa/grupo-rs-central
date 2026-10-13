import test from 'node:test';
import assert from 'node:assert/strict';
import {requestActivationLot,mountWarehouseActivation} from '../public/warehouse-activation.js';
const batch='11111111-1111-4111-8111-111111111111';
const chip=(id,state=null)=>({id,kind:'chip',status:'Disponível',classification:'Reserva',chip_provider:'arya',activation_state:state,serial:'89999000000000000001'});

test('one action prepares then sends 10/20 chips, excluding all pending states',async()=>{
 for(const size of [10,20]){
  const warehouse=[...Array.from({length:size},(_,i)=>chip('qa-'+i)),...['prepared','sending','requested','uncertain','active'].map(s=>chip(s,s))],calls=[];
  const repo={warehouse,request:async(path,options)=>{calls.push({path,...options});return calls.length===1?{ok:true,id:batch,state:'prepared'}:{ok:true,state:'requested'};}};
  assert.equal((await requestActivationLot(repo,warehouse.map(r=>r.id),size)).state,'requested');
  assert.equal(calls.length,2);assert.equal(calls[0].body.ids.length,size);assert.equal(calls[0].body.action,'prepare');assert.equal(calls[1].body.batch,batch);assert.equal(calls[1].body.action,'send');
 }
});

test('failed preparation or no eligible chips never initiates send',async()=>{
 for(const answer of [{ok:false},{ok:true},{ok:true,id:batch,state:'requested'}]){
  let calls=0;await assert.rejects(requestActivationLot({warehouse:[chip('qa')],request:async()=>{calls++;return answer;}},['qa'],10));assert.equal(calls,1);
 }
 await assert.rejects(requestActivationLot({warehouse:[chip('qa','requested')],request:()=>assert.fail('No request expected')},['qa'],10));
});

test('uncertain or failed send is never retried automatically',async()=>{
 for(const fail of [false,true]){
  let calls=0;const repo={warehouse:[chip('qa')],request:async()=>{if(++calls===1)return {ok:true,id:batch,state:'prepared'};if(fail)throw Error('QA timeout');return {ok:true,state:'uncertain'};}};
  const pending=requestActivationLot(repo,['qa'],10);if(fail)await assert.rejects(pending,/timeout/);else assert.equal((await pending).state,'uncertain');assert.equal(calls,2);
 }
});

test('selection and a single click send the lot; concurrent clicks cannot duplicate preparation',async()=>{
 const elements=new Map(),root={isConnected:true,innerHTML:'',querySelector(selector){if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);},querySelectorAll(){return [];}};
 let resolvePrepare;const calls=[],repo={real:true,user:{branches:[{id:'imperatriz',role:'admin'}],permissions:{owner:true}},warehouse:[chip('qa')],request:async(path,options)=>{calls.push({path,...options});if(calls.length===1)return new Promise(resolve=>resolvePrepare=resolve);return {ok:true,state:'requested',message:'QA solicitado'};}};
 const panel=mountWarehouseActivation(root,{repo,icon:()=>''});panel.update(repo.warehouse);
 assert.ok(!root.innerHTML.includes('reserve-checked'));assert.ok(!root.innerHTML.includes('data-confirm-batch'));assert.ok(!root.innerHTML.includes('Preparar solicitação'));
 root.querySelector('#reserve-select').onclick();const first=root.querySelector('#reserve-request').onclick();await root.querySelector('#reserve-request').onclick();assert.equal(calls.length,1);
 resolvePrepare({ok:true,state:'prepared',id:batch});await first;assert.equal(calls.length,2);assert.ok(root.innerHTML.includes('QA solicitado'));
});
