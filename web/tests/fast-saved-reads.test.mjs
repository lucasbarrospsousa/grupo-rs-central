import test from 'node:test';
import assert from 'node:assert/strict';
import {SqlRepository} from '../public/sql-repository.js';
import {PagePreloadCache} from '../public/page-preload.js';
import {devicePage} from '../backend/device-page.mjs';
import worker from '../hosting/worker.mjs';
const user={username:'fixture',branches:[{id:'imperatriz'},{id:'araguaina'}],permissions:{owner:true}};
const tick=()=>new Promise(r=>setTimeout(r,5));
test('chips warms before secondary panels; cached opening and visible stock do not wait for overview',async()=>{
 const r=new SqlRepository();r.user=user;r.currentBranch='imperatriz';const calls=[];let release;
 r.networkRequest=async path=>{calls.push(path);if(path.startsWith('warehouse?')&&new URLSearchParams(path.split('?')[1]).get('view')==='overview')await new Promise(resolve=>release=resolve);return {cursor:'1',rows:[],total:0};};
 const warm=r.preloadSelected('imperatriz',{delay:0});while(!release)await tick();
 try{
  const chips=calls.find(p=>p.startsWith('warehouse?'));assert.equal(new URLSearchParams(chips.split('?')[1]).get('view'),'chips');
  const before=calls.length;await r.readView('imperatriz',chips);assert.equal(calls.length,before);
  await r.readStockPage('imperatriz',{});assert.equal(calls.filter(p=>p.includes('scope=page')).length,1);
 }finally{release();await warm;}
 assert.equal(calls.filter(p=>p.startsWith('warehouse?')&&p.includes('view=chips')).length,1);
});
test('visible stock resolves while a background warehouse panel remains blocked; no bundle or supplier call',async()=>{
 const r=new SqlRepository();r.user=user;r.currentBranch='imperatriz';let release,warehouseDone=false;const calls=[];
 r.networkRequest=async path=>{calls.push(path);assert.ok(!path.includes('startup-bundle'));if(path.startsWith('warehouse?')&&!release){await new Promise(resolve=>release=resolve);warehouseDone=true;}if(path.startsWith('warehouse-costs'))return {ok:true,items:[]};return {cursor:'1',rows:[],total:0,statuses:[],carriers:[]};};
 const warm=r.preloadSelected('imperatriz',{delay:0});while(!release)await tick();
 const data=await r.readStockPage('imperatriz',{});assert.deepEqual(data.rows,[]);assert.equal(warehouseDone,false);
 const n=calls.length;await r.readStockPage('imperatriz',{});assert.equal(calls.length,n);
 release();await warm;assert.equal(calls.filter(p=>p.startsWith('devices?')&&p.includes('scope=page')).length,1);
 assert.ok(!calls.some(p=>/refresh|stock-page|carrier/.test(p)));
});
test('preload respects permissions and stops queued work after logout',async()=>{
 const r=new SqlRepository();r.user={...user,permissions:{views:['stock']}};r.currentBranch='imperatriz';const calls=[];
 r.networkRequest=async path=>{calls.push(path);return {rows:[],cursor:'1'};};await r.preloadSelected('imperatriz',{delay:0});assert.equal(calls.length,1);assert.match(calls[0],/scope=page/);
 r.clearPreload();r.user=null;await r.preloadSelected('imperatriz',{delay:0}).catch(()=>{});assert.equal(calls.length,1);
});
test('device mutation retains unrelated branch cache but removes dependent warehouse snapshots',()=>{
 const c=new PagePreloadCache({storage:{getItem:()=>null}});c.snapshots={'imperatriz:summary':{},'araguaina:summary':{},'araguaina:page:x':{},'araguaina:view:warehouse?view=chips':{}};
 c.dropForMutation('devices/id?branch=imperatriz');assert.deepEqual(Object.keys(c.snapshots),['araguaina:summary','araguaina:page:x']);
 c.dropForMutation('users/id');assert.deepEqual(c.snapshots,{});
});
test('summary aggregates in SQL and preserves exact status and carrier grouping',async()=>{
 const c={query:async(sql,args)=>{assert.equal(args[0],'imperatriz');if(sql.includes('as cursor'))return {rows:[{cursor:'1',changes:[]}]};assert.match(sql,/group by 1,2/);return {rows:[{status:'Estoque',carrier:'MULTI OPERADORA',quantity:2},{status:'Instalado',carrier:'Multi',quantity:3},{status:'Inativo',carrier:'',quantity:1}]};}};
 const result=await devicePage(c,'imperatriz',new URLSearchParams({scope:'summary'}));assert.equal(result.total,6);assert.equal(result.statuses.find(x=>x.label==='Estoque').count,2);assert.equal(result.statuses.find(x=>x.label==='Inativos').count,0);assert.equal(result.carriers.find(x=>x.label==='Multioperadora').count,5);
});
test('regional forwarding preserves authentication, CSRF and errors without replaying writes',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push(options);return Response.json({error:'fixture'},{status:503});};
 try{const env={CENTRAL_BRIDGE_TOKEN:'fixture'},origin='https://fixture.test';const response=await worker.fetch(new Request(origin+'/api/devices?branch=imperatriz',{method:'POST',headers:{origin,cookie:'central_session=fixture','x-csrf-token':'csrf'},body:'{}'}),env);assert.equal(response.status,503);assert.equal(calls.length,1);assert.equal(calls[0].headers.get('x-region'),'us-west-2');assert.equal(calls[0].headers.get('cookie'),'central_session=fixture');assert.equal(calls[0].headers.get('x-csrf-token'),'csrf');await worker.fetch(new Request(origin+'/'),env);assert.equal(calls[1].headers['x-region'],'us-west-2');}finally{globalThis.fetch=original;}
});
