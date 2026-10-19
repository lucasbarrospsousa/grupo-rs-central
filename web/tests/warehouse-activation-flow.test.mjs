import test from 'node:test';
import assert from 'node:assert/strict';
import {requestActivationLot,sendPreparedActivationLot,mountWarehouseActivation} from '../public/warehouse-activation.js';
const batch='11111111-1111-4111-8111-111111111111',confirm=()=>true;
const chip=i=>({id:'qa-'+i,kind:'chip',status:'Disponível',classification:'Reserva',chip_provider:'arya',serial:'895500000000000'+String(i).padStart(4,'0')});
const warehouse=Array.from({length:51},(_,i)=>chip(i));
function fixture(){const calls=[];return {calls,repo:{warehouse:structuredClone(warehouse),request:async(path,options)=>{calls.push({path,...options});return options.body.action==='prepare'?{ok:true,id:batch,state:'prepared',count:options.body.iccids.length,iccids:[...options.body.iccids]}:{ok:true,state:'requested'};}}};}
test('limit 20, manual lots 10+10+10+10+10+1: exact IDs and ICCIDs, never fill the limit',async()=>{
 const f=fixture();for(let start=0;start<51;start+=10){const selected=f.repo.warehouse.slice(start,start+10),ids=selected.map(r=>r.id),iccids=selected.map(r=>r.serial);let shown;
 await requestActivationLot(f.repo,ids,20,{confirm:x=>(shown=x,true)});assert.deepEqual(shown,iccids);assert.deepEqual(f.calls.at(-2).body.ids,ids);assert.deepEqual(f.calls.at(-1).body.iccids,iccids);
 }assert.equal(f.calls.filter(c=>c.body.action==='send').flatMap(c=>c.body.iccids).length,51);
});
test('cancel, missing/changed selection and duplicates cannot silently send another selection',async()=>{
 const f=fixture();await requestActivationLot(f.repo,['qa-0'],20,{confirm:()=>false});assert.equal(f.calls.length,0);
 for(const ids of [['missing'],['qa-0','qa-0']])await assert.rejects(requestActivationLot(f.repo,ids,20,{confirm}));
 f.repo.warehouse[0].activation_state='requested';await assert.rejects(requestActivationLot(f.repo,['qa-0','qa-1'],20,{confirm}));assert.equal(f.calls.length,0);
});
test('mismatched prepared ICCIDs/count block send; exact set may be reordered',async()=>{
 for(const bad of [{iccids:['8955000000000099999'],count:1},{iccids:[warehouse[0].serial],count:2},{iccids:undefined,count:1}]){const f=fixture();f.repo.request=async(path,options)=>{f.calls.push(options);return {ok:true,state:'prepared',id:batch,...bad};};await assert.rejects(requestActivationLot(f.repo,['qa-0'],20,{confirm}),/diferente/);assert.equal(f.calls.length,1);}
});
test('concurrent panel calls and lost responses never send twice automatically',async()=>{
 const f=fixture();let release;const original=f.repo.request;f.repo.request=async(...args)=>{if(args[1].body.action==='prepare')await new Promise(r=>release=r);return original(...args);};
 const pending=requestActivationLot(f.repo,['qa-0'],20,{confirm});await Promise.resolve();await assert.rejects(requestActivationLot(f.repo,['qa-1'],20,{confirm}),/andamento/);release();await pending;assert.equal(f.calls.length,2);
 const g=fixture();g.repo.request=async(path,o)=>{g.calls.push(o);if(o.body.action==='send')throw Error('timeout');return {ok:true,state:'prepared',id:batch,count:1,iccids:[warehouse[0].serial]};};await assert.rejects(requestActivationLot(g.repo,['qa-0'],20,{confirm}),/timeout/);assert.equal(g.calls.length,2);
});
test('prepared history lot is re-read and reviewed before explicit sending',async()=>{
 const f=fixture();f.repo.readView=async()=>({rows:[{...warehouse[2],activation_state:'prepared'}]});let reviewed;
 await sendPreparedActivationLot(f.repo,batch,{confirm:x=>(reviewed=x,true)});assert.deepEqual(reviewed,[warehouse[2].serial]);assert.deepEqual(f.calls[0].body.iccids,reviewed);
});
test('failed attempt clears selection, and filters/page changes clear hidden selections',async()=>{
 const elements=new Map(),root={isConnected:true,innerHTML:'',querySelector(s){if(!elements.has(s))elements.set(s,{focus(){},setSelectionRange(){}});return elements.get(s);},querySelectorAll(){return [];}};
 const repo={real:true,user:{branches:[{id:'imperatriz',role:'admin'}],permissions:{owner:true}},warehouse:structuredClone(warehouse),request:async()=>{throw Error('Falha simulada');}};
 const old=globalThis.confirm;globalThis.confirm=confirm;
 try{mountWarehouseActivation(root,{repo,icon:()=>''}).update(repo.warehouse);root.querySelector('#reserve-size').onchange({target:{value:'20'}});root.querySelector('#reserve-select').onclick();await root.querySelector('#reserve-request').onclick();assert.match(root.innerHTML,/0\/20 selecionados/);
 root.querySelector('#reserve-select').onclick();root.querySelector('#reserve-next').onclick();assert.match(root.innerHTML,/0\/20 selecionados/);
 root.querySelector('#reserve-select').onclick();root.querySelector('#reserve-search').oninput({target:{value:'99999',selectionStart:5}});assert.match(root.innerHTML,/0\/20 selecionados/);
 }finally{globalThis.confirm=old;}
});
