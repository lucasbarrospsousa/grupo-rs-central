import test from 'node:test';import assert from 'node:assert/strict';
import {syncTick,guardedIntegrations} from '../backend/background-sync.mjs';
import {Integrations} from '../backend/integrations.mjs';
test('background worker honors batch limit and releases lease even when upstream fails',async()=>{
 const saved=[],queries=[];const pool={query:async(sql,args)=>{queries.push(sql);if(sql.includes('sync_claim'))return{rows:[{batch:{cycle:2,rows:Array.from({length:50},(_,i)=>({id:String(i),branch:'maraba',serial:'024'+String(i).padStart(6,'0')}))}}]};if(sql.includes('sync_save'))saved.push(args);return{rows:[]};}};
 const out=await syncTick(pool,{service:{stockDetails:async()=>{throw Error('offline');}}});assert.equal(out.processed,50);assert.equal(saved.length,50);assert.equal(saved[0][3].chip.ok,false);assert.match(queries.at(-1),/sync_release/);
});
test('invalid credentials open a persistent circuit and later calls do not retry',async()=>{
 let calls=0,alerts=0;const pool={query:async(sql,args)=>{if(args?.length===3)alerts++;return{rows:[{blocked:false}]};}};const service={credentials:()=>({username:'test',password:'test'}),api:async()=>{calls++;throw Object.assign(Error('rejected'),{credentialInvalid:true});},portal:async()=>{},carrier:async()=>{}};const s=guardedIntegrations(pool,service);
 await assert.rejects(s.api('maraba','/test'));await assert.rejects(s.api('maraba','/test'));assert.equal(calls,1);assert.equal(alerts,1);
});
test('expired carrier token renews once, keeping an exact ICCID query',async()=>{
 let login=0,read=0;const s=new Integrations({secrets:()=>({arya_email:'test',arya_password:'test'}),request:async url=>{if(url.endsWith('/auth')){login++;return{text:JSON.stringify({token:'test'}),headers:new Headers()};}if(++read===1)throw Object.assign(Error('expired'),{upstreamStatus:401});return{text:JSON.stringify({data:[{iccid:'8955000000000000001',conn_status:false}]}),headers:new Headers()};}});
 const r=await s.carrier('arya','8955000000000000001');assert.equal(r.connectivity,'Off');assert.equal(login,2);assert.equal(read,2);
});
test('invalid API login is marked for stopping; network timeout is not credential failure',async()=>{
 const s=new Integrations({secrets:()=>({grupo_rs_modern_user:'test',grupo_rs_modern_password:'test'}),request:async()=>{throw Object.assign(Error('rejected'),{upstreamStatus:401});}});await assert.rejects(s.api('imperatriz','/test'),e=>e.credentialInvalid===true);
});

test('network failures do not mark credentials invalid',async()=>{
 const s=new Integrations({secrets:()=>({grupo_rs_modern_user:'test',grupo_rs_modern_password:'test'}),request:async()=>{throw Error('Timeout');}});
 await assert.rejects(s.api('imperatriz','/test'),e=>!e.credentialInvalid);
});
