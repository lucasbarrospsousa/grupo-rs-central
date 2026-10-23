import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalView,initialReadPlan,landingView,warehousePreloadPaths} from '../public/startup-preload.js';
import {SqlRepository} from '../public/sql-repository.js';
const user={username:'fixture',branches:[{id:'imperatriz',role:'admin'}],permissions:{owner:true}},branch='imperatriz';
const repo=()=>{const r=new SqlRepository();r.user=user;r.currentBranch=branch;return r;};
test('login landing is overview, ignores previous route and keeps authorized branches',()=>{
 assert.deepEqual(landingView(user),{branch,route:'overview'});
 assert.deepEqual(landingView({...user,branches:[{id:'maraba'}]}),{branch:'maraba',route:'overview'});
 assert.throws(()=>landingView({...user,branches:[]}));
});
test('five bounded warehouse panels; no supplier API or full inventory reads',()=>{
 const paths=warehousePreloadPaths(user,branch,new Date('2026-10-19T12:00:00Z'));
 assert.equal(paths.length,5);assert.deepEqual(paths.map(p=>new URLSearchParams(p.split('?')[1]).get('view')),['chips','overview','items','movements','monthly']);
 assert.ok(paths.every(p=>p.startsWith('warehouse?')&&!p.includes('export')));
 assert.equal(warehousePreloadPaths(user,'maraba').length,0);
 const p=initialReadPlan({...user,permissions:{views:['stock']}},branch);
 assert.deepEqual(p,{views:[],summary:false,stock:true,paths:[]});
});
test('prefetch and navigation share one read across parameter order; invalidation and explicit refresh work',async()=>{
 const r=repo(),path=warehousePreloadPaths(user,branch)[1];let release,calls=0;
 r.networkRequest=async()=>{calls++;return new Promise(resolve=>release=resolve);};
 const a=r.readView(branch,path),b=r.readView(branch,'warehouse?'+[...new URLSearchParams(path.split('?')[1])].reverse().map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&'));
 assert.equal(calls,1);release({cursor:'1',rows:[],total:0});assert.deepEqual(await a,await b);
 await r.readView(branch,path);assert.equal(calls,1);
 r.networkRequest=async()=>{calls++;return {cursor:'2',rows:[],total:0};};
 await r.readView(branch,path,{force:true});assert.equal(calls,2);
 r.invalidate(branch);await r.readView(branch,path);assert.equal(calls,3);
});
test('failed prefetch retries and logout rejects late cached data',async()=>{
 const r=repo(),path=warehousePreloadPaths(user,branch)[0];
 r.networkRequest=async()=>{throw Error('offline')};await assert.rejects(r.readView(branch,path));assert.equal(r.viewFlights.size,0);
 let release;r.networkRequest=async()=>new Promise(resolve=>release=resolve);
 const p=r.readView(branch,path);r.clearPreload();release({rows:[],cursor:'9'});
 await assert.rejects(p,/Dados alterados/);assert.equal(r.views.size,0);assert.equal(r.viewFresh.size,0);
});
test('stock preload stays SQL only and shares the initial page without changing current selection',async()=>{
 const r=repo();let calls=0,release;r.networkRequest=async path=>{assert.ok(path.startsWith('devices?'));calls++;return new Promise(resolve=>release=resolve);};
 const a=r.readStockPage(branch,{}, {preload:true});assert.equal(r.currentStockQuery,undefined);
 const b=r.readStockPage(branch,{});release({rows:[],cursor:'1'});await a;await b;
 await r.readStockPage(branch,{});assert.equal(calls,1);
});

test('invalidation rejects an old stock response instead of caching it again',async()=>{
 const r=repo();let release;r.networkRequest=async()=>new Promise(resolve=>release=resolve);
 const p=r.readStockPage(branch,{});r.invalidate(branch);release({rows:[],cursor:'1'});
 await assert.rejects(p,/Dados alterados/);assert.equal(r.stockFresh.size,0);
});
