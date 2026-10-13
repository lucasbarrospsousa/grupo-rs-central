import test from 'node:test';
import assert from 'node:assert/strict';
import {SqlRepository} from '../public/sql-repository.js';
import {applyMutationReceipt} from '../public/mutation-receipt.js';
import {wireWarehouseRegistration} from '../public/warehouse-register.js';
const branch='imperatriz',device={id:'device',branch,serial:'999000001',version:2,status:'Estoque'};
function repo(){const r=new SqlRepository();r.currentBranch=branch;r.warehouseBranch=branch;r.devices=[{...device,version:1}];r.warehouse=[{id:'chip',branch,version:1,serial:'89999000000000000001'}];return r;}
test('CRUD, bulk, reports and transfer finish from one HTTP receipt, without a GET',async t=>{
 const r=repo(),calls=[];
 const changes={branch,devices:[device],warehouse:[{id:'chip',branch,version:2,received_at:'2026-01-01',status:'Enviado'}],reports:[{id:'report',branch,version:2,observation:'QA'}],movements:[{id:'movement',branch,created_at:'2026-01-01',destination:'QA',items:[{serial:'89999000000000000001',kind:'chip'}]}]};
 t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(options.method);return Response.json({ok:true,id:'saved',changes});});
 r.load=async()=>assert.fail('Unexpected full reload');
 await r.saveDevice(branch,{model:'QA'},r.devices[0]);await r.deleteDevice(branch,r.devices[0]);
 await r.addWarehouse('chip','89999000000000000001');await r.classifyWarehouse('chip','Reserva');await r.removeWarehouse('chip');
 await r.transfer(['chip'],'QA','');await r.addBulk([]);await r.saveReport({branch,id:'request'});await r.updateReport({id:'report',branch,version:1},{observation:'QA'});
 assert.equal(calls.length,9);assert.ok(calls.every(m=>m!=='GET'));assert.equal(r.devices[0].version,2);
 assert.equal(r.reports.length,1);assert.equal(r.warehouse[0].version,2);assert.equal(r.movements.length,1);
});
test('late receipts cannot regress versions or resurrect a deleted record',()=>{
 const r=repo();applyMutationReceipt(r,{branch,devices:[{...device,version:4}]});
 applyMutationReceipt(r,{branch,devices:[{...device,version:2}]});assert.equal(r.devices[0].version,4);
 applyMutationReceipt(r,{branch,removedDevices:[{id:device.id,version:5}]});
 applyMutationReceipt(r,{branch,devices:[{...device,version:4},{...device,version:5}]});assert.equal(r.devices.length,0);
});
test('other branches and related warehouse movements remain scoped',()=>{
 const r=repo();r.currentBranch='maraba';const visible=r.warehouse;
 applyMutationReceipt(r,{branch:'maraba',devices:[{...device,branch:'maraba',id:'other'}],relatedWarehouse:{branch,warehouse:[{id:'chip',version:3,status:'Utilizado',received_at:'2026-01-01'}]}});
 assert.equal(r.warehouse,visible);assert.equal(r.warehouseCache.get(branch).rows[0].status,'Utilizado');assert.equal(r.devices.length,2);
});
test('HTTP failure and application failure never apply receipts; logout ignores late responses',async t=>{
 const r=repo();t.mock.method(globalThis,'fetch',async()=>Response.json({changes:{branch,devices:[{...device,version:8}]}},{status:409}));
 await assert.rejects(r.saveDevice(branch,{},r.devices[0]));assert.equal(r.devices[0].version,1);
 t.mock.method(globalThis,'fetch',async()=>Response.json({ok:false,message:'Gravação recusada',changes:{branch,devices:[{...device,version:8}]}}));
 await assert.rejects(r.saveDevice(branch,{},r.devices[0]),/recusada/);assert.equal(r.devices[0].version,1);
 t.mock.method(globalThis,'fetch',async()=>{r.epoch++;return Response.json({ok:true,changes:{branch,devices:[{...device,version:8}]}});});
 await r.saveDevice(branch,{},r.devices[0]);assert.equal(r.devices[0].version,1);
});
test('an older in-flight list cannot overwrite the confirmed change',async()=>{
 const r=repo();let resolve;r.request=()=>new Promise(done=>{resolve=done;});
 const pending=r.loadGroup(branch,'devices');r.writeVersion++;applyMutationReceipt(r,{branch,devices:[device]});resolve({rows:[{...device,version:1}]});await pending;
 assert.equal(r.devices[0].version,2);
});

test('saved chip is on the first page immediately and matches the reloaded warehouse',async t=>{
 const r=repo();r.loaded.add(branch+':warehouse');
 const old=Array.from({length:20},(_,i)=>({id:'old-'+i,branch,kind:'chip',version:1,received_at:'2026-01-01',serial:'8999900000000000'+String(i).padStart(4,'0')}));
 r.applyGroup(branch,'warehouse',{rows:old,movements:[]});
 const added={id:'new-chip',branch,kind:'chip',serial:'89999000000000000999',version:1,status:'Disponível',received_at:'2026-10-13'};
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push(options.method);return Response.json({ok:true,id:added.id,changes:{branch,warehouse:[added]}});});
 await r.addWarehouse('chip',added.serial);r.activate(branch,'warehouse');
 assert.equal(r.warehouse.slice(0,8)[0].id,added.id);assert.deepEqual(calls,['POST']);
 const before=structuredClone(r.warehouse);r.applyGroup(branch,'warehouse',{rows:[added,...old],movements:[]});assert.deepEqual(r.warehouse,before);
 applyMutationReceipt(r,{branch,warehouse:[{...old[0],version:2,classification:'Reserva'}]});assert.equal(r.warehouse[0].id,added.id);
 applyMutationReceipt(r,{branch,removedWarehouse:[{id:added.id,version:2}]});assert.equal(r.warehouse.some(r=>r.id===added.id),false);
});

test('new devices and reports are visible without refresh; updates and removals preserve other records',()=>{
 const r=repo();r.reports=[{id:'old',branch,version:1}];
 applyMutationReceipt(r,{branch,devices:[{...device,id:'new',version:1}],reports:[{id:'new-report',branch,version:1}]});
 assert.equal(r.devices[0].id,'new');assert.equal(r.reports[0].id,'new-report');
 applyMutationReceipt(r,{branch,devices:[{...device,id:'new',version:2,status:'Reserva'}],reports:[{id:'new-report',branch,version:2,observation:'Alterado'}]});
 assert.equal(r.devices[0].status,'Reserva');assert.equal(r.reports[0].observation,'Alterado');
 applyMutationReceipt(r,{branch,removedDevices:[{id:'new',version:3}]});assert.deepEqual(r.devices.map(r=>r.id),['device']);
});

test('registration switches to the saved kind before rendering success and does not do so on failure',async t=>{
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',isConnected:true,classList:{toggle(){}},querySelector:element});return elements.get(id);};
 const original=globalThis.document;globalThis.document={querySelector:element};t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
 const events=[];let pending,fail=false;
 const r={real:true,currentBranch:branch,request:async()=>({ok:true,iccid:'89999000000000000999',provider:'arya',operator:'QA'}),addWarehouse:async()=>{if(fail)throw Error('QA recusado');events.push('saved');}};
 wireWarehouseRegistration({repo:r,branch,modal:{close:()=>events.push('close')},notify:()=>events.push('success'),render:()=>events.push('render'),safe:fn=>{pending=fn();},escape:String,validIccid:()=>true,onSaved:kind=>events.push(kind)});
 element('#kind-chip').onclick();element('#new-serial').value='89999000000000000999';element('#chip-provider').value='arya';await element('#lookup-chip').onclick();
 element('#warehouse-form').onsubmit({preventDefault(){}});await pending;assert.deepEqual(events,['saved','close','chip','render','success']);
 events.length=0;fail=true;element('#warehouse-form').onsubmit({preventDefault(){}});await assert.rejects(pending,/recusado/);assert.deepEqual(events,[]);
});
