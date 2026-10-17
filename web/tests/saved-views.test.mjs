import test from 'node:test';import assert from 'node:assert/strict';
import {selectWarehouseView,warehouseView} from '../backend/warehouse-view.mjs';
import {selectHistoryView} from '../backend/history-view.mjs';
import {costView} from '../backend/cost-view.mjs';
import {devicePage} from '../backend/device-page.mjs';
import {SqlRepository} from '../public/sql-repository.js';
import {PagePreloadCache} from '../public/page-preload.js';
const data={rows:Array.from({length:160},(_,i)=>({id:'w'+i,branch:'imperatriz',serial:'089550000000000'+String(i).padStart(5,'0'),kind:i<50?'device':'chip',status:'Disponível',classification:i%2?'Estoque':'Reserva',chip_provider:'arya',received_at:'2026-10-17T10:00:00Z'})),movements:[]};
const p=o=>new URLSearchParams(o);
test('maintenance lookup preserves identification and partial serial search across the whole branch',async()=>{
 const rows=Array.from({length:100},(_,i)=>({id:String(i),serial:'024'+String(i).padStart(6,'0'),data:{identification:'XRS - '+i,client:'Cliente '+i}}));
 const c={query:async(sql,args)=>{if(sql.includes('as cursor'))return {rows:[{cursor:'1',changes:[]}]};const selected=rows.filter(r=>[r.serial,r.data.identification].some(v=>v.includes(args[1])));return {rows:[{rows:selected,total:selected.length,page:1,customers:[]}]};}};
 const result=await devicePage(c,'imperatriz',p({scope:'lookup',mode:'maintenance',query:'XRS - 99'}));assert.equal(result.total,1);assert.equal(result.rows[0].serial,'024000099');
 const partial=await devicePage(c,'imperatriz',p({scope:'lookup',mode:'maintenance',query:'02400009'}));assert.equal(partial.total,10);
});
test('warehouse filters search beyond visible rows; totals are never page totals',()=>{
 const chips=selectWarehouseView(data,p({view:'chips',page:2,status:'Disponível'}));assert.equal(chips.rows.length,7);assert.equal(chips.total,110);assert.equal(chips.counts.device.total,50);assert.equal(chips.counts.chip.total,110);
 const match=selectWarehouseView(data,p({view:'chips',query:data.rows[159].serial,category:'Estoque'}));assert.equal(match.total,1);assert.equal(match.rows[0].serial,data.rows[159].serial);
 assert.equal(selectWarehouseView(data,p({view:'items',page:999})).page,6);
 const activation=selectWarehouseView(data,p({view:'activation'}));assert.equal(activation.rows.length,20);assert.equal(activation.total,110);
 assert.throws(()=>selectWarehouseView(data,p({view:'chips',page:-1})),/Filtros/);
});
test('unchanged warehouse view reads only revision; changed list reads a bounded SQL page',async()=>{
 const calls=[],c={query:async(sql,args)=>{calls.push({sql,args});return sql.includes('as cursor')?{rows:[{cursor:'8',changes:[]}]}:{rows:[{rows:data.rows.slice(0,8),total:50,page:0,categories:[{kind:'device',category:'Estoque',count:25},{kind:'device',category:'Reserva',count:25}]}]};}};
 const unchanged=await warehouseView(c,'imperatriz',p({view:'items',since:'8'}));assert.equal(unchanged.unchanged,true);assert.equal(calls.length,1);
 calls.length=0;const result=await warehouseView(c,'imperatriz',p({view:'items'}));assert.equal(result.rows.length,8);assert.equal(result.counts.device.total,50);assert.equal(calls.length,2);assert.match(calls[1].sql,/limit \$8 offset/);assert.equal(calls[1].args[0],'imperatriz');assert.equal(calls[1].args[7],8);
});
test('maintenance aggregates and export include matching records outside the page',()=>{
 const rows=Array.from({length:29},(_,i)=>({id:String(i),client:'Cliente '+i,plate:'ABC'+i,currentSerial:'024'+i,entry:'2026-10-17T10:00:00Z',reason:'Sem comunicação'}));
 const result=selectHistoryView(rows,p({view:'records',page:2}));assert.equal(result.rows.length,6);assert.equal(result.total,29);assert.equal(result.stats.total,29);
 assert.equal(selectHistoryView(rows,p({view:'records',search:'Cliente 28'})).total,1);
 assert.equal(selectHistoryView(rows,p({view:'indicators'})).rows.length,0);
 assert.equal(selectHistoryView(rows,p({view:'records',export:'1'})).rows.length,29);
});
test('billing keeps full totals and groups but sends only the visible chips and invoice details',()=>{
 const items=Array.from({length:40},(_,i)=>({iccid:'089550000000000'+i,provider:'arya',operator:'TIM',state:'Confirmado',cents:320,devices:['024'+i]})),data={ok:true,items,inventory_items:items,total_cents:12800,billing:{invoices:[{items:items.map(r=>({iccid:r.iccid,cents:320}))}]}};
 const page=costView(data,p({view:'page',page:2}));assert.equal(page.items.length,12);assert.equal(page.total,40);assert.equal(page.operators[0].count,40);assert.equal(page.total_cents,12800);assert.equal(page.billing.invoices[0].items.length,12);
 assert.equal(costView(data,p({view:'summary'})).items.length,0);assert.equal(costView(data,p({view:'page',query:'02439'})).total,1);
 assert.equal(costView(data,p({view:'page',page:2,since:page.cursor})).unchanged,true);
});
test('all routes avoid full inventory preloading; cached pages hydrate actions and clear on access changes',async()=>{
 const user={username:'test',branches:[{id:'imperatriz',role:'admin'}],permissions:{owner:true}},r=new SqlRepository();r.user=user;await r.pageCache.bind(user);r.preloadSelected=async()=>[];
 for(const route of ['warehouse','maintenance','tracking','records','route','bulk','sms','settings','users','logs'])assert.deepEqual(r.groups(route),[]);
 const path='warehouse?branch=imperatriz&view=chips',snapshot={cursor:'10',rows:[data.rows[70]],total:110};r.pageCache.save('imperatriz','view:'+path,snapshot);r.activate('imperatriz','warehouse');assert.equal(r.warehouse.length,0);assert.equal(r.peekView('imperatriz',path).total,110);assert.equal(r.warehouse[0].id,'w70');
 r.networkRequest=async path=>{assert.match(path,/since=10/);return {cursor:'11',unchanged:true};};assert.equal((await r.readView('imperatriz',path)).rows[0].serial,data.rows[70].serial);
 const cache=new PagePreloadCache();await cache.bind({...user,permissions:{views:['stock']}});assert.equal(cache.allowed('imperatriz','view:'+path),false);assert.equal(cache.allowed('maraba','view:'+path),false);
 r.clearPreload();assert.equal(r.views.size,0);assert.equal(r.pageCache.snapshot('imperatriz','view:'+path),null);
});
