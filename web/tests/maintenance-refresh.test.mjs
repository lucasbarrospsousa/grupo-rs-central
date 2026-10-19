import test from 'node:test';import assert from 'node:assert/strict';
import {startMaintenanceRefresh,loadMaintenance} from '../public/maintenance-refresh.js';
import {maintenanceSnapshot} from '../backend/maintenance-monitor.mjs';
const user=()=>({permissions:{owner:true},branches:[{id:'imperatriz'},{id:'maraba'}]});
test('first check at one minute; hourly while another tab is selected; stops at logout',async()=>{
 const repo={user:user(),epoch:0,currentRoute:'stock'},jobs=[],calls=[];let now=0;
 startMaintenanceRefresh(repo,{setTimer:(fn,ms)=>{jobs.push({fn,ms});return jobs.length},clearTimer:()=>{},now:()=>now,read:async(r,b,m)=>calls.push([b,m])});
 assert.equal(jobs[0].ms,60000);assert.equal(calls.length,0);now=60000;await jobs[0].fn();
 assert.deepEqual(calls,[['imperatriz','automatic'],['maraba','automatic']]);assert.equal(jobs[1].ms,3600000);
 repo.stopMaintenanceRefresh();await jobs[1].fn();assert.equal(calls.length,2);
});
test('restart replaces timer and permissions do not expand',()=>{
 const repo={user:user(),epoch:0};let stopped=0,scheduled=0;
 const opts={setTimer:()=>++scheduled,clearTimer:()=>stopped++};
 startMaintenanceRefresh(repo,opts);startMaintenanceRefresh(repo,opts);assert.equal(stopped,1);assert.equal(scheduled,2);
 repo.user={permissions:{views:['stock']},branches:[]};startMaintenanceRefresh(repo,opts);assert.equal(scheduled,2);
});
test('saved page reads never request refresh; concurrent callers share the same request',async()=>{
 const repo={user:user(),request:async p=>{assert.ok(p.endsWith('&saved=1'));return {rows:[],count:0}}};
 await Promise.all([loadMaintenance(repo,'imperatriz'),loadMaintenance(repo,'imperatriz')]);
});
test('server gate prevents duplicate/fresh refresh and saved mode cannot call external service',async()=>{
 let external=0,claimed=false,released=0;const previous={rows:[],count:0,checked_at:'saved'};
 const pool={query:async(sql,args)=>{if(sql.includes('maintenance_snapshot'))return {rows:[{data:args[1]||previous}]};if(sql.includes('refresh_claim')){const ok=!claimed;claimed=true;return {rows:[{ok}]};}if(sql.includes('refresh_release'))released++;return {rows:[]};}};
 const service={maintenance:async()=>{external++;return previous}};
 await maintenanceSnapshot(pool,service,'imperatriz','saved');assert.equal(external,0);
 await Promise.all([maintenanceSnapshot(pool,service,'imperatriz','automatic'),maintenanceSnapshot(pool,service,'imperatriz','automatic')]);
 assert.equal(external,1);assert.equal(released,1);
});
test('missing saved copy is pending, not a confirmed empty inventory',async()=>{
 const pool={query:async()=>({rows:[{data:null}]})};
 const data=await maintenanceSnapshot(pool,{maintenance:()=>{throw Error('Forbidden')}},'imperatriz','saved');
 assert.equal(data.pending,true);assert.equal(data.count,null);
});
test('refresh failure preserves previous results and releases lease',async()=>{
 let release=false;const previous={count:2,rows:[{},{}]};
 const pool={query:async(sql)=>{if(sql.includes('refresh_claim'))return{rows:[{ok:true}]};if(sql.includes('refresh_release'))release=true;return {rows:[{data:previous}]}}};
 const data=await maintenanceSnapshot(pool,{maintenance:async()=>{throw Error('Offline')}},'imperatriz','automatic');
 assert.equal(data.count,2);assert.equal(release,true);
});
