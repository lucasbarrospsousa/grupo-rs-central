import test from 'node:test';import assert from 'node:assert/strict';
import {createStockLive} from '../public/stock-live.js';
import {SqlRepository} from '../public/sql-repository.js';
import {deviceSqlQuery} from '../backend/device-sql-page.mjs';
import {pageOptions,selectDevicePage} from '../backend/device-page.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('50 devices finish after navigation/hidden tab, reuse one monitor, and stop on branch/logout',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const oldDocument=globalThis.document,oldWindow=globalThis.window,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const listeners=new Map();let root={isConnected:true,querySelectorAll:()=>Array.from({length:50},(_,i)=>({dataset:{detail:String(i)}}))};const heading={textContent:''};
 globalThis.document={hidden:false,querySelector:s=>s==='#stock-body'?root:s==='.stock-card-heading small'?heading:null};globalThis.window={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 const r=new SqlRepository();r.user={username:'test'};r.currentBranch='imperatriz';r.preloadSelected=async()=>{};const calls=[],pending=[];let active=0,max=0;
 r.request=async(path,{signal}={})=>{if(path==='logout')return{};calls.push(path);active++;max=Math.max(max,active);return new Promise(resolve=>pending.push(()=>{active--;const u=new URL(path,'http://local');resolve({results:[{id:u.searchParams.get('ids'),ok:true,[u.searchParams.get('kind')==='chips'?'chip':'location']:{ok:true}}]});}));};
 try{
  const a=createStockLive({repo:r,branch:'imperatriz',draw(){},showModal(){}});a.refresh();t.mock.timers.tick(1300);await flush();assert.equal(calls.length,2);
  root.isConnected=false;document.hidden=true;r.activate('imperatriz','overview');assert.equal(r.stockMonitor,a);
  for(let i=0;i<50;i++){pending.splice(0).forEach(f=>f());await flush();}
  assert.equal(calls.length,100);assert.equal(max,2);assert.equal(r.stockSamples.get('imperatriz').size,50);
  root={isConnected:true,querySelectorAll:()=>Array.from({length:50},(_,i)=>({dataset:{detail:String(i)}}))};
  const b=createStockLive({repo:r,branch:'imperatriz',draw(){},showModal(){}});assert.equal(a,b);b.refresh();t.mock.timers.tick(29999);await flush();assert.equal(calls.length,100);t.mock.timers.tick(1);await flush();assert.equal(calls.length,102);
  r.activate('araguaina','overview');assert.equal(r.stockMonitor,null);pending.splice(0).forEach(f=>f());await flush();t.mock.timers.tick(60000);await flush();assert.equal(calls.length,102);
  r.currentBranch='imperatriz';const c=createStockLive({repo:r,branch:'imperatriz',draw(){},showModal(){}});c.refresh();await r.logout();t.mock.timers.tick(60000);await flush();assert.equal(calls.length,102);assert.equal(listeners.size,0);
 }finally{r.stockMonitor?.close();globalThis.document=oldDocument;globalThis.window=oldWindow;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;t.mock.timers.reset();}
});
test('stock pages cover 50 unique records; lookup remains 10 and SQL remains branch scoped',()=>{
 const rows=Array.from({length:101},(_,i)=>({id:String(i),serial:String(24000000+i),status:'Estoque'}));const pages=[1,2,3].map(page=>selectDevicePage(rows,'imperatriz',pageOptions(new URLSearchParams({page}))));assert.deepEqual(pages.map(p=>p.rows.length),[50,50,1]);assert.equal(new Set(pages.flatMap(p=>p.rows.map(r=>r.id))).size,101);
 for(const [scope,size] of [['page',50],['lookup',10]]){const p=new URLSearchParams({scope});const q=deviceSqlQuery('imperatriz',p,pageOptions(p));assert.ok(q.sql.includes('else '+size+' end'));assert.ok(q.sql.includes('(page-1)*'+size));assert.equal(q.values[0],'imperatriz');}
});
