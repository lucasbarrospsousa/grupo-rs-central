import test from 'node:test';import assert from 'node:assert/strict';
import {savedOwners,ownerValidSql} from '../backend/saved-owners.mjs';
import {readFileSync} from 'node:fs';
import {isOwnerQuery} from '../public/stock-owner-search.js';
test('saved search binds inputs, retains dates, excludes invalid and ambiguous owners',async()=>{
 const owner={client_id:'1',client:'José',checked_at:'2026-10-20T12:00:00Z',serial:'024000001'};
 const c={query:async(sql,args)=>{assert.deepEqual(args,['imperatriz','Jose']);assert.match(sql,/d.branch_id=\$1/);assert.doesNotMatch(sql,/update |insert |delete /i);return {rows:[{valid:true,owner},{valid:false,owner},{valid:true,owner:{...owner,client_id:'2'}},{valid:true,owner:{...owner,client_id:'2',client:'Outra pessoa'}}]};}};
 const r=await savedOwners(c,'imperatriz','Jose');assert.equal(r.rows.length,1);assert.equal(r.pending,3);assert.equal(r.rows[0].bindings[0].checked_at,owner.checked_at);
 await assert.rejects(savedOwners(c,'imperatriz','ab'),e=>e.status===400);
});
test('predicate checks all identity keys and in-flight swaps',()=>{for(const s of ['equipment_id','vehicle_id','client_id','checked_at','branch','serial','plate','move_sent','return_sent'])assert.ok(ownerValidSql.includes(s));});
test('name UI only uses saved devices and does not start automatic stock rounds',()=>{const ui=readFileSync(new URL('../public/stock-owner-search.js',import.meta.url),'utf8'),page=readFileSync(new URL('../public/stock-page.js',import.meta.url),'utf8');assert.doesNotMatch(ui,/integrations\/|1300|owner_save/);assert.match(ui,/scope:'owners'/);assert.match(page,/if\(live&&!isOwnerQuery\(model.query\)\)/);assert.equal(isOwnerQuery('José Silva'),true);assert.equal(isOwnerQuery('ABC-1234'),false);});

test('UI selects saved bindings without a second request and ignores stale search responses',async()=>{
 const {mountOwnerSearch}=await import('../public/stock-owner-search.js');const listeners={};let selected,requests=0,resolve;
 const select={hidden:true,replaceChildren(){},add(){}},status={textContent:''},host={isConnected:true,querySelector:s=>s==='select'?select:status};
 const input={value:'Jose',addEventListener:(n,f)=>listeners[n]=f,removeEventListener(){}};
 const old={Option:globalThis.Option,MutationObserver:globalThis.MutationObserver,document:globalThis.document};
 globalThis.Option=class{};globalThis.MutationObserver=class{observe(){} disconnect(){}};globalThis.document={body:{}};
 const binding={serial:'024000001',checked_at:'2026-10-20T12:00:00Z'};
 try{mountOwnerSearch(host,{branch:'imperatriz',input,onSelect:r=>selected=r,repo:{request:async url=>{requests++;assert.ok(url.startsWith('devices?'));return {rows:[{id:'1',name:'Jose',bindings:[binding]}],pending:0};}}});await listeners['stock-search']();assert.equal(requests,1);assert.deepEqual(selected,[binding]);assert.match(status.textContent,/20\/10\/2026/);
 mountOwnerSearch(host,{branch:'imperatriz',input,onSelect:()=>assert.fail('Stale response applied'),repo:{request:()=>new Promise(r=>resolve=r)}});const pending=listeners['stock-search']();input.value='Maria';listeners.input();resolve({rows:[{id:'1',name:'Jose',bindings:[binding]}],pending:0});await pending;
 }finally{Object.assign(globalThis,old);}
});
