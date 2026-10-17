import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeIncremental} from '../public/incremental-cache.js';
import {SqlRepository} from '../public/sql-repository.js';
import {parseCursor,incrementalRead} from '../backend/incremental-read.mjs';
import {permitted} from '../backend/user-access.mjs';
test('delta handles deletion, insertion, movements, and rejects stale responses',()=>{
 const first={cursor:'4',rows:[{id:'a',version:1},{id:'b',version:1}],movements:[{id:'m'}]};
 const next=mergeIncremental(first,{delta:true,cursor:'7',rows:[{id:'b',version:2},{id:'c'}],removed:['a'],movements:[{id:'n'}],removedMovements:['m']});
 assert.deepEqual(next.rows,[{id:'b',version:2},{id:'c'}]);assert.deepEqual(next.movements,[{id:'n'}]);
 assert.equal(mergeIncremental(next,{delta:true,cursor:'6',rows:[{id:'a'}]}),next);
 assert.equal(mergeIncremental(next,{delta:true,cursor:'8',unchanged:true}).rows,next.rows);
 assert.throws(()=>mergeIncremental(null,{delta:true,cursor:'9'}));
});
test('invalid and overflowing cursors fail closed',()=>{for(const v of ['-1','1.1','1 OR 1=1','9223372036854775808'])assert.throws(()=>parseCursor(v));assert.equal(parseCursor('0'),'0');});
test('unchanged request uses one metadata query and returns no records',async()=>{
 let n=0;const data=await incrementalRead({query:async()=>{n++;return {rows:[{cursor:'8',changes:[]}]}}},'imperatriz','devices','8');
 assert.equal(n,1);assert.deepEqual(data,{cursor:'8',delta:true,unchanged:true});
});
test('repository reuses cursor on existing refresh and keeps prior rows on empty delta',async()=>{
 const r=new SqlRepository(),calls=[];r.request=async path=>{calls.push(path);return calls.length===1?{cursor:'1',rows:[{id:'a',serial:'999999991'}]}:{cursor:'1',delta:true,unchanged:true};};
 await r.loadGroup('imperatriz','devices');r.invalidate('imperatriz',['devices']);await r.loadGroup('imperatriz','devices');
 assert.deepEqual(calls,['devices?branch=imperatriz','devices?branch=imperatriz&since=1']);assert.equal(r.devices.length,1);
 await r.loadGroup('imperatriz','devices');assert.equal(calls.length,2);
 r.clearPreload();assert.equal(r.incremental.size,0);
});
test('warehouse delta preserves untouched items and movements',async()=>{
 const r=new SqlRepository();r.currentBranch='imperatriz';r.acceptIncremental('imperatriz','warehouse',{cursor:'1',rows:[{id:'a',serial:'x',branch:'imperatriz',received_at:'2026-01-01'},{id:'b',serial:'y',received_at:'2026-01-01'}],movements:[]});
 r.acceptIncremental('imperatriz','warehouse',{cursor:'2',delta:true,rows:[],removed:['a'],movements:[]});assert.deepEqual(r.warehouse.map(x=>x.id),['b']);
});
test('stock update shares the existing request, no added polling',async()=>{
 const r=new SqlRepository();r.acceptIncremental('imperatriz','devices',{cursor:'1',rows:[{id:'a',serial:'x',branch:'imperatriz'}]});let n=0;
 r.networkRequest=async path=>{n++;assert.match(path,/since=1/);return {results:[],savedChanges:{cursor:'2',delta:true,rows:[{id:'a',serial:'y',branch:'imperatriz'}]}}};
 await r.request('integrations/stock-page?branch=imperatriz&kind=locations&ids=a');assert.equal(n,1);assert.equal(r.devices[0].serial,'y');
});
test('unchanged counts reuse values, and module restrictions remain enforced',async()=>{
 const r=new SqlRepository();let n=0;r.networkRequest=async path=>++n===1?{cursor:'1',stock:9}:{cursor:'2',unchanged:true};
 const p='integrations/inventory-counts?branch=imperatriz';await r.request(p);assert.equal((await r.request(p)).stock,9);assert.equal(n,2);
 const access={owner:false,views:['warehouse'],writes:[]};assert.equal(permitted(access,'/api/devices','GET'),false);assert.equal(permitted(access,'/api/warehouse','GET'),true);assert.equal(permitted(access,'/api/warehouse','POST'),false);
});
