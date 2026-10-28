import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReadModel} from './read-model.mjs';
import {Operations} from './operations.mjs';
const key='12'.repeat(32);
function store(){const map=new Map();return {map,get:async k=>Array.isArray(k)?new Map(k.filter(k=>map.has(k)).map(k=>[k,map.get(k)])):map.get(k),put:async(k,v)=>{if(typeof k==='object')for(const [a,b] of Object.entries(k))map.set(a,b);else map.set(k,v);},delete:async k=>{for(const a of Array.isArray(k)?k:[k])map.delete(a);}};}
const document=()=>({schemaVersion:1,kind:'tracking',branch:{id:'imperatriz'},copiedAt:new Date().toISOString(),rows:[{serial:'024000001',token:'NEVER_EXPOSE',status:'Estoque'}],maintenance:[{id:'maintenance'}],warehouse:{rows:[{id:'chip'},{id:'deleted',deleted_at:'today'}],movements:[],costs:{total_cents:100},audit:['PRIVATE']}});
test('encrypted display survives restart, filters modules/costs, excludes private fields and old revisions',async()=>{
 const storage=store(),cache=new ReadModel(storage,key,'scope');
 await cache.publish('imperatriz',document());
 assert.ok(!JSON.stringify([...storage.map]).includes('024000001'));
 const cold=new ReadModel(storage,key,'scope'),reader=await cold.read('imperatriz',{warehouse:true,stock:false});
 assert.deepEqual(reader.rows,[]);assert.equal(reader.warehouse.costs,null);assert.equal(reader.warehouse.rows.length,1);assert.equal(reader.maintenance,undefined);assert.equal(reader.warehouse.audit,undefined);
 const owner=await cold.read('imperatriz',{stock:true,warehouse:true,maintenance:true,owner:true});
 assert.equal(owner.warehouse.costs.total_cents,100);assert.equal(owner.rows[0].token,undefined);
 assert.equal(await new ReadModel(storage,key,'other account').read('imperatriz',{}),null);
 assert.equal(await new ReadModel(storage,'34'.repeat(32),'scope').read('imperatriz',{}),null);
 const count=storage.map.size;await cache.publish('imperatriz',document());assert.equal(storage.map.size,count);
});
test('cached bootstrap bypasses slow provider writer and includes only authorized branches/modules',async()=>{
 const storage=store(),ops=new Operations({storage},{AUTH_DATA_KEY:key,DRIVE_CONFIG:'{}'});
 await ops.display.publish('imperatriz',document());
 let release;const writer=ops.queue.run('__writer',()=>new Promise(r=>release=r));
 const user={branches:[{id:'imperatriz'}],permissions:{views:['warehouse'],owner:false}};
 const response=await Promise.race([ops.fetch(new Request('https://internal/display',{method:'POST',body:JSON.stringify({user})})),new Promise((_,reject)=>setTimeout(()=>reject(Error('Blocked on writer')),200))]);
 assert.equal(response.status,200);const rows=await response.json();assert.equal(rows.length,1);assert.deepEqual(rows[0].rows,[]);assert.equal(rows[0].warehouse.costs,null);
 release();await writer;
});
