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
test('Android heartbeat only validates connection and never reads or dispatches queued work',async()=>{
 const token='c'.repeat(64),id=crypto.randomUUID();let data={gateway:{token_hash:digest(token),ready:true},operations:[{id,kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'test',created_at:new Date().toISOString(),state:'queued'}]};
 const result=await galaxyAndroid({input:{action:'heartbeat',branch:'imperatriz',app_version:'1.5.0'},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 assert.equal(result.connected,true);assert.equal(data.operations[0].state,'queued');assert.equal(data.gateway.ready,false);
});
test('session-authenticated Galaxy polls only its owner jobs and cannot change another user receipt',async()=>{
 const token='d'.repeat(64),created_at=new Date().toISOString(),own=crypto.randomUUID(),other=crypto.randomUUID();
 let data={gateway:{token_hash:digest(token),ready:false},operations:[
  {id:own,kind:'sms',serial:'',phone:'99999999999',command:'Teste integracao gateway',actor:'mobile-user',created_at,state:'queued',target_type:'contact',contact_name:'QA'},
  {id:other,kind:'sms',serial:'',phone:'99999999998',command:'Outro',actor:'outro-usuario',created_at,state:'queued',target_type:'contact',contact_name:'Outro'}
 ]};
 const users=async()=>({users:[{active:true,username:'mobile-user',branches:[{id:'imperatriz'}],permissions:{writes:['sms']}},{active:true,username:'outro-usuario',branches:[{id:'imperatriz'}],permissions:{writes:['sms']}}]});
 const call=input=>galaxyAndroid({input:{branch:'imperatriz',app_version:'1.5.0',...input},token,mobileUser:'mobile-user',document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users});
 const check=await call({action:'heartbeat'});assert.equal(check.queued,1);assert.equal(data.operations[0].state,'queued');assert.equal(data.operations[1].state,'queued');
 const dispatch=await call({action:'poll',ready:true});assert.deepEqual(dispatch.jobs.filter(job=>job.payload).map(job=>job.id),[own]);assert.equal(data.operations.find(job=>job.id===other).state,'queued');
 await assert.rejects(call({action:'report',id:other,state:'failed'}),e=>e.status===409);
});
test('Android 1.2 receives a contact and apparatus batch once with line cadence and no duplicate delivery',async()=>{
 const token='b'.repeat(64),batch='batch-1',created_at=new Date().toISOString(),ops=[{id:crypto.randomUUID(),kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'test',created_at,state:'queued',target_type:'device',batch_id:batch,delay_seconds:3},{id:crypto.randomUUID(),kind:'sms',serial:'024000002',phone:'99999999998',command:'locache,123456,1',actor:'test',created_at,state:'queued',target_type:'contact',contact_name:'Contato',batch_id:batch,delay_seconds:20}];let data={gateway:{token_hash:digest(token),ready:true},operations:ops};const call=input=>galaxyAndroid({input:{branch:'imperatriz',app_version:'1.2.0',...input},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});const delivered=await call({action:'poll',ready:true});assert.equal(delivered.jobs.filter(x=>x.payload).length,2);const [device,contact]=delivered.jobs.filter(x=>x.payload);assert.equal(device.payload.version,3);assert.equal(device.payload.delay_seconds,3);assert.equal(contact.payload.target_type,'contact');assert.equal(contact.payload.serial,'024000002');assert.equal(contact.payload.contact_name,'Contato');assert.deepEqual((await call({action:'poll',ready:true})).jobs.filter(x=>x.payload),[]);
});
test('Android contact SMS accepts printable Unicode but rejects control characters',async()=>{
 const token='e'.repeat(64),created_at=new Date().toISOString(),id=crypto.randomUUID();let data={gateway:{token_hash:digest(token)},operations:[{id,kind:'sms',serial:'',phone:'99999999991',command:'Olá, teste Unicode!',actor:'test',created_at,state:'queued',target_type:'contact',contact_name:'Teste',batch_id:id,delay_seconds:10}]};
 const call=async()=>galaxyAndroid({input:{action:'poll',branch:'imperatriz',ready:true,app_version:'1.5.8'},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 const result=await call();assert.equal(result.jobs[0].payload.command,'Olá, teste Unicode!');assert.equal(data.operations[0].state,'dispatched');
 const blocked={...data.operations[0],id:crypto.randomUUID(),state:'queued',command:'Olá\nteste'};data.operations.push(blocked);const second=await call();assert.equal(second.jobs.some(job=>job.id===blocked.id&&job.payload),false);assert.equal(data.operations.find(job=>job.id===blocked.id).state,'failed');
});
