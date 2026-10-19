import test from 'node:test';import assert from 'node:assert/strict';
import {copySelectedIccids,selectedIccids} from '../public/warehouse-chip-copy.js';
import {requestActivationLot,sendPreparedActivationLot,mountWarehouseActivation} from '../public/warehouse-activation.js';
const warehouse=Array.from({length:51},(_,i)=>({id:'qa-'+i,kind:'chip',status:'Disponível',classification:'Reserva',chip_provider:'arya',serial:'895500000000000'+String(i).padStart(4,'0')}));
test('51 selected in groups 10+10+10+10+10+1 copy exact strings, never filling any lot',async()=>{
 const copies=[];for(let i=0;i<51;i+=10){const chosen=warehouse.slice(i,i+10);await copySelectedIccids(warehouse,chosen.map(r=>r.id),{writeText:async text=>copies.push(text)});}
 assert.deepEqual(copies.flatMap(s=>s.split(';')),warehouse.map(r=>r.serial));
 assert.equal(new Set(copies.flatMap(s=>s.split(';'))).size,51);
});
test('copy preserves order and leading zeroes; rejects missing, duplicate and numeric serials',()=>{
 const rows=[{id:'a',kind:'chip',serial:'00123456789012345678'},{id:'b',kind:'chip',serial:'895445500008854741'}];
 assert.equal(selectedIccids(rows,['b','a']),'895445500008854741;00123456789012345678');
 for(const ids of [[],['a','a'],['x']])assert.throws(()=>selectedIccids(rows,ids));
 assert.throws(()=>selectedIccids([{...rows[0],serial:1234567890123}],['a']));
});
test('legacy frontend entrypoints cannot contact an API',async()=>{
 const repo={request:()=>assert.fail('No API'),readView:()=>assert.fail('No API')};
 await assert.rejects(requestActivationLot(repo,['qa-0'],20),/não envia/);
 await assert.rejects(sendPreparedActivationLot(repo,'old'),/não envia/);
});
test('monitor copying and page/filter changes clear selection; failed copy preserves it',async()=>{
 const elements=new Map(),root={isConnected:true,innerHTML:'',querySelector(s){if(!elements.has(s))elements.set(s,{focus(){},setSelectionRange(){}});return elements.get(s);},querySelectorAll(){return [];}};
 const repo={real:true,user:{branches:[{id:'imperatriz',role:'admin'}],permissions:{owner:true}},warehouse,request:()=>assert.fail('Copy cannot call API')};
 const old=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copied='';
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async v=>{copied=v;}}}});
 try{
  mountWarehouseActivation(root,{repo,icon:()=>''}).update(warehouse);
  assert.doesNotMatch(root.innerHTML,/Solicitar ativação|data-send-batch|reserve-size/);
  root.querySelector('#reserve-select').onclick();await root.querySelector('#reserve-copy').onclick();
  assert.equal(copied,warehouse.slice(0,20).map(r=>r.serial).join(';'));assert.match(root.innerHTML,/0 selecionados/);
  root.querySelector('#reserve-select').onclick();root.querySelector('#reserve-next').onclick();assert.match(root.innerHTML,/0 selecionados/);
  root.querySelector('#reserve-select').onclick();root.querySelector('#reserve-search').oninput({target:{value:'8955',selectionStart:4}});assert.match(root.innerHTML,/0 selecionados/);
  navigator.clipboard.writeText=async()=>{throw Error('Clipboard negado');};root.querySelector('#reserve-select').onclick();await root.querySelector('#reserve-copy').onclick();assert.match(root.innerHTML,/20 selecionados/);assert.match(root.innerHTML,/Clipboard negado/);
 }finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
});
