import test from 'node:test';import assert from 'node:assert/strict';import {galaxyAndroid} from './galaxy-android.mjs';import {digest} from './auth-crypto.mjs';
test('Android diagnosis blocks payload; explicit readiness, receipt barrier and delivery never resend',async()=>{
 const token='a'.repeat(64),id=crypto.randomUUID();let data={gateway:{token_hash:digest(token)},operations:[{id,kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'test',created_at:new Date().toISOString(),state:'queued'}]};let active=true;
 const call=input=>galaxyAndroid({input:{branch:'imperatriz',...input},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 assert.deepEqual((await call({action:'poll',ready:false})).jobs,[]);
 const job=(await call({action:'poll',ready:true})).jobs[0];assert.equal(job.payload.expires_at-job.payload.created_at,7200);assert.equal(job.payload.phone,'+5599999999999');assert.equal(job.payload.version,2);
 assert.equal((await call({action:'poll',ready:true})).jobs[0].payload,undefined);
 assert.equal((await call({action:'report',id,state:'received'})).state,'received');
 await call({action:'report',id,state:'sent'});await call({action:'report',id,state:'delivered'});assert.deepEqual((await call({action:'poll',ready:true})).jobs,[]);
 await assert.rejects(call({action:'report',id,state:'received'}),e=>e.status===409);
 data.operations.push({...data.operations[0],id:crypto.randomUUID(),state:'queued'});active=false;assert.deepEqual((await call({action:'poll',ready:true})).jobs,[]);assert.equal(data.operations[1].state,'cancelled');
});
