import test from 'node:test';
import assert from 'node:assert/strict';
import {SqlRepository} from '../public/sql-repository.js';
import {bundlePaths} from '../backend/startup-bundle.mjs';
const branch='imperatriz',user={username:'fixture',user_id:'id',branches:[{id:branch,role:'admin'}],permissions:{owner:true,views:[],writes:[]}};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){const r=new SqlRepository();r.user=user;r.currentBranch=branch;let resolveSummary,resolveBundle;const calls=[];
r.networkRequest=async path=>{calls.push(path);if(path.startsWith('devices?scope=summary'))return new Promise(resolve=>resolveSummary=resolve);if(path.startsWith('startup-bundle?'))return new Promise(resolve=>resolveBundle=resolve);throw Error('Unexpected request: '+path);};
return {r,calls,summary:()=>resolveSummary({cursor:'1',total:12,statuses:[],carriers:[]}),bundle:(failed)=>resolveBundle({panels:bundlePaths(user,user.permissions,user.branches,branch).filter(p=>!p.includes('scope=summary')).map(path=>({path,ok:path!==failed,data:{ok:true,rows:[],items:[],total:0,cursor:'1'}}))})};}
test('overview resolves before background; early navigation shares one bundle',async()=>{
 const f=setup(),work=f.r.preloadSelected(branch);assert.equal(f.calls.length,1);
 const path='warehouse?branch=imperatriz&month='+new Date().toISOString().slice(0,7)+'&view=overview';
 const navigation=f.r.readView(branch,path),stock=f.r.readStockPage(branch,{});
 f.summary();await tick();assert.equal(f.r.ready(branch,'overview'),true);assert.equal(f.calls.length,2);
 assert.match(f.calls[1],/phase=background/);assert.equal(f.r.preloadRunning!==null,true);
 f.bundle();await Promise.all([work,navigation,stock]);assert.equal(f.calls.length,2);
 await f.r.readView(branch,path);await f.r.readStockPage(branch,{});await f.r.request('users');assert.equal(f.calls.length,2);
 assert.equal(f.r.startupBatch,null);
});
test('late response after logout/invalidation cannot refill page caches',async()=>{
 for(const logout of [false,true]){const f=setup(),work=f.r.preloadSelected(branch);f.summary();await tick();
 if(logout)f.r.clearPreload();else f.r.invalidate(branch);
 f.bundle();await work;assert.equal(f.r.views.size,0);assert.equal(f.r.stockPages.size,0);assert.equal(f.r.viewFresh.size,0);
 }
});
test('partial failure preserves successful panels and never fans out retries',async()=>{
 const f=setup(),work=f.r.preloadSelected(branch);f.summary();await tick();f.bundle('users');const results=await work;
 assert.ok(results.includes(false));assert.ok(f.r.views.size>0);assert.equal(f.calls.length,2);
 f.r.networkRequest=async p=>{f.calls.push(p);return {users:[]}};assert.deepEqual(await f.r.request('users'),{users:[]});assert.equal(f.calls.length,3);
});
test('background endpoint excludes summary without changing allowed panel set',async()=>{
 const {startupBundle}=await import('../backend/startup-bundle.mjs');const db={query:async()=>({rows:user.branches}),connect:async()=>({query:async()=>({rows:[]}),release(){}})};
 const result=await startupBundle(db,user,user.permissions,branch,{background:true,reader:async()=>({})});
 assert.equal(result.panels.length,15);assert.ok(result.panels.every(p=>!p.path.includes('scope=summary')));
});
