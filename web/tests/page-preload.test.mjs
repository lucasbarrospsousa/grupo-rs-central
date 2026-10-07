import test from 'node:test';
import assert from 'node:assert/strict';
import {PagePreloadCache,preloadPlan} from '../public/page-preload.js';
import {SqlRepository} from '../public/sql-repository.js';
const user={username:'test',csrf:'session-test',branches:[{id:'imperatriz'},{id:'araguaina'}],permissions:{owner:true}};
const data={rows:[],visits:[],movements:[]};
function storage(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
test('preload respects selected branch, hidden modules and view permissions',()=>{
 assert.deepEqual(preloadPlan(user,'imperatriz').groups,['devices','warehouse','history']);
 assert.deepEqual(preloadPlan(user,'araguaina').groups,['devices','history']);
 assert.deepEqual(preloadPlan(user,'maraba'),{groups:[],paths:[]});
 assert.deepEqual(preloadPlan({...user,permissions:{views:['warehouse','sms']}},'araguaina'),{groups:[],paths:[]});
 assert.deepEqual(preloadPlan({...user,permissions:{views:['stock']}},'imperatriz'),{groups:['devices'],paths:[]});
 assert.ok(preloadPlan(user,'imperatriz').paths.every(p=>!p.includes('integrations')));
});
test('temporary snapshots restore only same validated session and expire after five minutes',async()=>{
 const store=storage();let now=1000;const c=new PagePreloadCache({storage:store,now:()=>now});await c.bind(user);c.save('imperatriz','devices',data);
 const restored=new PagePreloadCache({storage:store,now:()=>now});await restored.bind(user);assert.deepEqual(restored.snapshot('imperatriz','devices'),data);assert.equal(restored.snapshot('araguaina','devices'),null);
 now+=300000;assert.equal(restored.snapshot('imperatriz','devices'),null);
 for(const change of [{username:'other'},{csrf:'another-session'},{permissions:{views:['sms']}},{branches:[{id:'araguaina'}]}]){
  await c.bind(user);c.save('imperatriz','devices',data);await restored.bind({...user,...change});assert.equal(restored.snapshot('imperatriz','devices'),null);assert.equal(store.length,0);
 }
 await c.bind(user);c.save('imperatriz','devices',data);c.clear();assert.equal(store.length,0);
});
test('storage unavailable and oversized snapshots do not prevent navigation',async()=>{
 const denied=new PagePreloadCache({storage:{get length(){throw Error('denied')}}});await denied.bind(user);assert.doesNotThrow(()=>denied.save('imperatriz','devices',data));
 const store=storage(),c=new PagePreloadCache({storage:store});await c.bind(user);c.save('imperatriz','devices',{rows:[{notes:'x'.repeat(2000001)}]});assert.equal(store.length,0);
});
test('preload is sequential and stops remaining work when branch changes',async()=>{
 const r=new SqlRepository();r.user=user;r.currentBranch='imperatriz';const calls=[];let running=0,max=0;
 r.request=async p=>{calls.push(p);max=Math.max(max,++running);await new Promise(x=>setTimeout(x,1));running--;return data};
 await r.preloadSelected('imperatriz',{delay:0});assert.equal(max,1);assert.equal(calls.length,8);
 r.invalidate('imperatriz');calls.length=0;r.request=async p=>{calls.push(p);r.currentBranch='araguaina';return data};await r.preloadSelected('imperatriz',{delay:0});assert.deepEqual(calls,['devices?branch=imperatriz']);
});
test('restored rows are usable immediately, then replaced; refresh failures retain explicit pending state',async()=>{
 const r=new SqlRepository();r.user=user;r.preloadBranch='imperatriz';await r.pageCache.bind(user);r.pageCache.save('imperatriz','devices',{rows:[{id:'saved',branch:'imperatriz'}]});r.activate('imperatriz','stock');
 assert.equal(r.ready('imperatriz','stock'),true);assert.equal(r.devices[0].id,'saved');let updates=0;r.onDataUpdate=()=>updates++;
 r.request=async()=>{throw Error('offline')};await assert.rejects(r.loadGroup('imperatriz','devices',{refresh:true}));assert.ok(r.refreshErrors.has('imperatriz:devices'));assert.equal(r.devices[0].id,'saved');
 r.request=async()=>({rows:[{id:'fresh',branch:'imperatriz'}]});await r.loadGroup('imperatriz','devices',{refresh:true});assert.equal(r.devices[0].id,'fresh');assert.equal(r.restored.size,0);assert.equal(r.refreshErrors.size,0);assert.equal(updates,2);
});
test('safe GETs deduplicate; mutation prevents an older background response from entering cache',async()=>{
 const r=new SqlRepository();r.user={...user,permissions:{owner:true,views:[]}};r.currentBranch='imperatriz';r.loaded=new Set(['imperatriz:devices','imperatriz:history','imperatriz:warehouse']);r.warehouseCache.set('imperatriz',{});
 let release,calls=0;r.networkRequest=async p=>{if(p==='settings-monitor'){calls++;return new Promise(resolve=>release=resolve)}return data};
 const loading=r.preloadSelected('imperatriz',{delay:0});while(!release)await new Promise(x=>setTimeout(x,1));const navigation=r.request('settings-monitor');assert.equal(calls,1);
 await r.request('query-policy',{method:'POST'});release({old:true});await navigation;await loading;assert.equal(r.pageCache.take('settings-monitor'),undefined);
});
