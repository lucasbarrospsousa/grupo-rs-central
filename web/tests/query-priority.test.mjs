import test from 'node:test';import assert from 'node:assert/strict';
import {setApiBudgetPool,withApiBudget,deferredQuery,queryPolicyInput} from '../backend/api-budget.mjs';
import {trackQueries,measuredRequest} from '../backend/query-usage.mjs';
import {codeTick} from '../backend/code-scan.mjs';
import {syncTick} from '../backend/background-sync.mjs';
import {maintenanceTick} from '../backend/maintenance-monitor.mjs';
import {sourceIntegrations} from '../backend/read-sources.mjs';
test('automatic deferral performs no upstream request, counts no failure and always cleans lease',async()=>{
 const calls=[];let upstream=0;const pool={query:async(sql,args)=>{calls.push({sql,args});return{rows:[{data:{wait_ms:250,reason:'manual'}}]};}};setApiBudgetPool(pool);
 await assert.rejects(trackQueries(pool,'automatic',()=>measuredRequest(()=>withApiBudget('imperatriz',()=>{upstream++;}),'https://imp.ogrupors.com.br/api_rest_app/test',{}),'codes'),e=>e.automaticDeferred&&e.reason==='manual');
 assert.equal(upstream,0);assert.equal(calls[0].args[2],'automatic');assert.equal(calls[0].args[3],'codes');assert.match(calls.at(-1).sql,/api_v2_release/);assert.ok(!calls.some(c=>c.sql.includes('record_query_usage')));
});
test('manual context remains isolated and admitted manual work cleans lease after failure',async()=>{
 const contexts=[];let releases=0;const pool={query:async(sql,args)=>{if(sql.includes('query_claim')){contexts.push(args.slice(2));return{rows:[{data:{wait_ms:args[2]==='automatic'?250:0,reason:'manual'}}]};}if(sql.includes('release'))releases++;return{rows:[]};}};setApiBudgetPool(pool);
 await Promise.all([assert.rejects(trackQueries(pool,'automatic',()=>withApiBudget('imperatriz',()=>{}),'stock')),assert.rejects(withApiBudget('imperatriz',()=>{throw Error('upstream');}),/upstream/)]);
 assert.deepEqual(contexts,[['automatic','stock'],['page','']]);assert.equal(releases,2);
});
test('code scan yields without saving failure or consuming an attempt',async()=>{
 const queries=[];const pool={query:async(sql,args)=>{queries.push({sql,args});return{rows:[{data:{rows:[{id:'synthetic',serial:'024000001'}],batch:1}}]};}};
 const result=await codeTick(pool,{service:{equipment:async()=>{throw deferredQuery('manual');}}});assert.equal(result.processed,0);assert.equal(result.deferred,'manual');assert.ok(!queries.some(q=>q.sql.includes('code_scan_save')));assert.equal(queries.at(-1).args[2],0);assert.match(queries.at(-1).sql,/release/);
});
test('stock and maintenance stop without replacing observations when yielding',async()=>{
 for(const kind of ['stock','maintenance']){const calls=[];const pool={query:async(sql)=>{calls.push(sql);return{rows:[kind==='stock'?{batch:{rows:[{id:'synthetic',branch:'imperatriz',serial:'024000001'}],cycle:1}}:{data:{rows:[{branch:'imperatriz',serial:'024000001'}]}}]};}};
 const tick=kind==='stock'?syncTick:maintenanceTick;const result=await tick(pool,{service:{stockCommunication:async()=>{throw deferredQuery('capacity');}}});assert.equal(result.processed,0);assert.ok(!calls.some(sql=>sql.includes('_save')));assert.match(calls.at(-1),/release/);}
});
test('automatic deferral never falls back to another source',async()=>{
 let fallback=0;const service=sourceIntegrations({equipment:async()=>{throw deferredQuery('manual');}},async()=>'both',{equipment:async()=>{fallback++;}});
 await assert.rejects(service.equipment('imperatriz','024000001'),e=>e.automaticDeferred);assert.equal(fallback,0);
});
test('configuration accepts only explicit states and bounded limits',()=>{
 const valid={priority:true,automatic_limit:1,resume_seconds:5,gap_seconds:2,stock:true,codes:false,maintenance:true};assert.deepEqual(queryPolicyInput(valid),valid);
 for(const patch of [{priority:'true'},{automatic_limit:3},{resume_seconds:-1},{gap_seconds:61},{codes:null},{gap_seconds:1.5}])assert.throws(()=>queryPolicyInput({...valid,...patch}),e=>e.status===400);
});

test('manual portal lookup retries a shared login deferred by an automatic context',async()=>{
 const {PortalRead}=await import('../backend/portal-read.mjs');let calls=0;
 const api={credentials:()=>({username:'synthetic',password:'synthetic'}),request:async url=>{if(url.endsWith('/login.php')&&++calls===1)throw deferredQuery('manual');return{text:'<table></table>',headers:new Headers()};}};
 const page=await new PortalRead(api).page('imperatriz','/cadastro/veiculos_listar.php');assert.equal(page,'<table></table>');assert.equal(calls,2);
});
