import test from 'node:test';import assert from 'node:assert/strict';
import {pageOptions,selectDevicePage,devicePage} from '../backend/device-page.mjs';
import {filterStock} from '../public/stock-model.js';
import {SqlRepository} from '../public/sql-repository.js';
import {PagePreloadCache} from '../public/page-preload.js';
const user={username:'test',csrf:'test',branches:[{id:'imperatriz',role:'admin'}],permissions:{owner:true}};
const rows=Array.from({length:3360},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,serial:String(24000000+i),branch:'imperatriz',status:i%5?'Instalado':'Estoque',plate:'ABC'+i,identification:'XRS '+i,carrier:i%2?'Vivo':'Claro',installed_at:'2026-10-16',updated_at:'2026-10-17',iccid:'8955'+i,phone:'5599'+i}));
rows[3359].owner_binding={branch:'imperatriz',serial:rows[3359].serial,plate:rows[3359].plate,client:'José Último'};
test('paging searches all 3360 records and keeps existing filter, sort and batch rules',()=>{
 for(const options of [{},{query:'Jose Ultimo'},{query:'ABC3359'},{query:'24000000;24003359;99999999;'},{status:'Instalado',sort:'serial',direction:-1,page:3},{start:'2026-10-17',end:'2026-10-17',sort:'carrier',direction:1}]){
  const opts=pageOptions(new URLSearchParams(options)),expected=filterStock(rows,{...opts,branch:'imperatriz'}),actual=selectDevicePage(rows,'imperatriz',opts);
  assert.equal(actual.total,expected.rows.length);assert.deepEqual(actual.rows,expected.rows.slice((actual.page-1)*10,actual.page*10));assert.deepEqual(actual.missing,expected.missing);assert.equal(actual.counts.Todos,3360);
 }
 const regional=selectDevicePage([{...rows[0],status:'Reserva'}],'araguaina',pageOptions(new URLSearchParams({status:'Estoque'})));assert.equal(regional.total,1);assert.equal(regional.counts.Estoque,1);
 assert.equal(selectDevicePage([], 'imperatriz',pageOptions(new URLSearchParams({page:'99'}))).page,1);
 for(const q of [{page:'-1'},{sort:'id;drop table'},{direction:0},{status:'wrong'},{start:'2026-11-01',end:'2026-10-01'}])assert.throws(()=>pageOptions(new URLSearchParams(q)));
});
test('backend sends one bounded SQL page and preserves unchanged marker behavior',async()=>{
 const calls=[],c={query:async(sql,args)=>{calls.push({sql,args});if(sql.includes('as cursor'))return {rows:[{cursor:'12',changes:[]}]};return {rows:[{rows:rows.slice(0,10).map(r=>({id:r.id,serial:r.serial,data:r,version:1})),total:3360,page:1,counts:{Todos:3360},found:3360,missing:[],customers:[]}]};}};
 const result=await devicePage(c,'imperatriz',new URLSearchParams({scope:'page'}));assert.equal(result.rows.length,10);assert.equal(result.total,3360);assert.equal(calls.length,2);assert.ok(calls[1].sql.includes('limit (case when'));assert.ok(calls.every(c=>c.args[0]==='imperatriz'));
 calls.length=0;assert.equal((await devicePage(c,'imperatriz',new URLSearchParams({scope:'page',since:'12'}))).unchanged,true);assert.equal(calls.length,1);
});
test('stock opening does not preload full lists or other modules; summaries remain independent',async()=>{
 const r=new SqlRepository();r.user=user;r.currentBranch='imperatriz';r.currentRoute='stock';const calls=[];r.networkRequest=async p=>{calls.push(p);return {cursor:'1',rows:[rows[0]],counts:{Todos:3360},total:3360,page:1}};
 await r.preloadSelected('imperatriz',{delay:0});assert.deepEqual(calls,[]);await r.readStockPage('imperatriz',{});assert.equal(calls.length,1);assert.ok(calls[0].includes('scope=page'));assert.equal(r.loaded.has('imperatriz:devices'),false);assert.equal(r.devices.length,1);
 r.networkRequest=async p=>{calls.push(p);return {cursor:'2',unchanged:true}};await r.readStockPage('imperatriz',{});assert.match(calls.at(-1),/since=1/);assert.equal(r.peekStockPage('imperatriz',{}).rows.length,1);
});
function storage(){const m=new Map();return {get length(){return m.size},key:i=>[...m.keys()][i],getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}}
function durable(){const m=new Map();return {get:async k=>structuredClone(m.get(k)),put:async(k,v,valid)=>{if(valid())m.set(k,structuredClone(v))},retain:async k=>{for(const x of m.keys())if(x!==k)m.delete(x)},clear:async()=>m.clear()};}
test('durable cache restores >5 MB after a new instance; access change and logout erase it',async()=>{
 const persistent=durable(),store=storage(),a=new PagePreloadCache({storage:store,persistent});await a.bind(user);
 const large={cursor:'10',rows:[{id:'large',notes:'x'.repeat(5350228)}],movements:[]};a.save('imperatriz','warehouse',large);await a.flush();
 const b=new PagePreloadCache({storage:store,persistent});assert.equal(b.snapshot('imperatriz','warehouse'),null);await b.bind(user);assert.equal(b.snapshot('imperatriz','warehouse').rows[0].notes.length,5350228);
 b.clear();await b.flush();a.save('imperatriz','warehouse',large);await a.flush();const c=new PagePreloadCache({storage:store,persistent});await c.bind(user);assert.equal(c.snapshot('imperatriz','warehouse'),null);
 c.save('imperatriz','warehouse',large);await c.flush();await c.bind({...user,permissions:{views:['stock']}});assert.equal(c.snapshot('imperatriz','warehouse'),null);
});

test('cached page hydrates actions after reopening without pretending the whole branch is loaded',async()=>{
 const r=new SqlRepository();r.user=user;await r.pageCache.bind(user);const model={status:'Todos'},key=r.stockQuery('imperatriz',model),data={cursor:'10',rows:[rows[0]],total:3360,page:1,counts:{Todos:3360}};
 r.pageCache.save('imperatriz','page:'+key,data);assert.equal(r.devices.length,0);assert.equal(r.peekStockPage('imperatriz',model).total,3360);assert.equal(r.devices[0].id,rows[0].id);assert.equal(r.loaded.has('imperatriz:devices'),false);
 r.adoptStockPage('imperatriz',key,{...data,cursor:'9',rows:[]});assert.equal(r.peekStockPage('imperatriz',model).rows.length,1);
});
