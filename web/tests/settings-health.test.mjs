import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh,syncHealth,sourceHealth} from '../public/settings-health-model.js';
import {testBranchConnections,integrationHealth} from '../backend/integration-health.mjs';
import {permitted} from '../backend/user-access.mjs';
const now=Date.parse('2026-09-27T16:00:00Z'),recent=new Date(now-30000).toISOString();
test('enabled is not treated as proof of a live worker',()=>{
 assert.equal(syncHealth({enabled:true,last_tick:null},now).label,'Sem sinal recente');
 assert.equal(syncHealth({enabled:false,last_tick:recent},now).tone,'warning');
 assert.equal(syncHealth({enabled:true,last_tick:recent,next_cycle_at:new Date(now+60000).toISOString()},now).label,'Aguardando próximo ciclo');
 assert.equal(fresh('invalid',now),false);assert.equal(fresh(new Date(now+120000).toISOString(),now),false);
});
test('no evidence, partial results, stale records and explicit alerts remain distinct',()=>{
 const snapshot={branch:'imperatriz',sync:{alerts:[]},sources:[]};
 assert.equal(sourceHealth('arya',snapshot,null,now).tone,'unknown');
 snapshot.sources=[{source:'api',attempted:10,confirmed:8,checked_at:recent}];assert.equal(sourceHealth('api',snapshot,null,now).label,'Consultas com pendências');
 snapshot.sources[0].confirmed=10;assert.equal(sourceHealth('api',snapshot,null,now).tone,'good');
 snapshot.sources[0].checked_at='2026-09-26T00:00:00Z';assert.equal(sourceHealth('api',snapshot,null,now).label,'Registro antigo');
 snapshot.sync.alerts=[{source:'api:imperatriz',message:'Bloqueada'}];assert.equal(sourceHealth('api',snapshot,{ok:true,checked_at:recent},now).label,'Acesso bloqueado');
});
test('manual test isolates vehicle and equipment API failures; does not claim carrier success',async()=>{
 const result=await testBranchConnections({api:async(b,path)=>{if(path.startsWith('/equipamentos'))throw Error('private upstream payload');return{}}},'imperatriz');
 assert.equal(result.checks[0].ok,true);assert.equal(result.checks[1].ok,false);assert.equal(result.checks.length,2);assert.ok(!JSON.stringify(result).includes('private upstream'));
});
test('health endpoint aggregates in user scope and excludes alerts from other branches',async()=>{
 const queries=[];const c={release(){},async query(sql,args){queries.push([sql,args]);if(sql.includes('sample.source'))return{rows:[{source:'api',confirmed:1,attempted:1}]};if(sql.includes('sms_bridge_status'))return{rows:[]};return{rows:[]}}};
 const pool={connect:async()=>c,query:async()=>({rows:[{status:{enabled:true,alerts:[{source:'api:imperatriz'},{source:'api:maraba'},{source:'carrier:arya'}]}}]})};
 const result=await integrationHealth(pool,{user_id:'test'},'imperatriz');assert.deepEqual(result.sync.alerts.map(a=>a.source),['api:imperatriz','carrier:arya']);assert.equal(result.gateway.ok,false);
 assert.ok(queries.some(([q,a])=>q.includes("set_config('central.user_id'")&&a[0]==='test'));assert.ok(queries.some(([q,a])=>q.includes('o.branch_id=$1')&&a[0]==='imperatriz'));
});
test('new diagnostic endpoints require settings view',()=>{
 for(const action of ['health','connection-test']){assert.equal(permitted({owner:false,views:['stock'],writes:[]},'/api/integrations/'+action,'GET'),false);assert.equal(permitted({owner:false,views:['settings'],writes:[]},'/api/integrations/'+action,'GET'),true);}
});
