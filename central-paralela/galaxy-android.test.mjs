import test from 'node:test';import assert from 'node:assert/strict';import {galaxyAndroid,galaxyAndroidUnified} from './galaxy-android.mjs';import {digest} from './auth-crypto.mjs';
test('Android diagnosis blocks payload; lost dispatch response retries the same ID until receipt, then never resends',async()=>{
 const token='a'.repeat(64),device='d'.repeat(64),id=crypto.randomUUID();let data={gateway:{token_hash:digest(token)},operations:[{id,kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'test',created_at:new Date().toISOString(),state:'queued'}]};let active=true;
 const call=input=>galaxyAndroid({input:{branch:'imperatriz',app_version:'1.5.11',device_id:device,...input},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 assert.deepEqual((await call({action:'poll',ready:false})).jobs,[]);
 const job=(await call({action:'poll',ready:true})).jobs[0];assert.equal(job.payload.expires_at-job.payload.created_at,7200);assert.equal(job.payload.phone,'+5599999999999');assert.equal(job.payload.version,3);
 const retry=(await call({action:'poll',ready:true})).jobs.find(x=>x.payload);assert.equal(retry.payload.id,job.payload.id);assert.deepEqual(retry.payload,job.payload);assert.equal(data.operations[0].dispatch_attempts,2);
 assert.equal((await call({action:'report',id,state:'received'})).state,'received');
 assert.equal((await call({action:'report',id,state:'received'})).duplicate,true);
 await call({action:'report',id,state:'sent'});await call({action:'report',id,state:'delivered'});assert.deepEqual((await call({action:'poll',ready:true})).jobs,[]);
 assert.equal((await call({action:'report',id,state:'received'})).stale,true);assert.equal(data.operations[0].state,'delivered');
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
 await assert.rejects(call({action:'report',id:other,state:'failed'}),e=>e.status===404);
});
test('Android 1.2 receives a contact and apparatus batch once with line cadence and no duplicate delivery',async()=>{
 const token='b'.repeat(64),batch='batch-1',created_at=new Date().toISOString(),ops=[{id:crypto.randomUUID(),kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'test',created_at,state:'queued',target_type:'device',batch_id:batch,delay_seconds:3},{id:crypto.randomUUID(),kind:'sms',serial:'024000002',phone:'99999999998',command:'locache,123456,1',actor:'test',created_at,state:'queued',target_type:'contact',contact_name:'Contato',batch_id:batch,delay_seconds:20}];let data={gateway:{token_hash:digest(token),ready:true},operations:ops};const call=input=>galaxyAndroid({input:{branch:'imperatriz',app_version:'1.2.0',...input},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});const delivered=await call({action:'poll',ready:true});assert.equal(delivered.jobs.filter(x=>x.payload).length,2);const [device,contact]=delivered.jobs.filter(x=>x.payload);assert.equal(device.payload.version,3);assert.equal(device.payload.delay_seconds,3);assert.equal(contact.payload.target_type,'contact');assert.equal(contact.payload.serial,'024000002');assert.equal(contact.payload.contact_name,'Contato');assert.deepEqual((await call({action:'poll',ready:true})).jobs.filter(x=>x.payload),[]);
});
test('Android contact SMS accepts printable Unicode but rejects control characters',async()=>{
 const token='e'.repeat(64),created_at=new Date().toISOString(),id=crypto.randomUUID();let data={gateway:{token_hash:digest(token)},operations:[{id,kind:'sms',serial:'',phone:'99999999991',command:'Olá, teste Unicode!',actor:'test',created_at,state:'queued',target_type:'contact',contact_name:'Teste',batch_id:id,delay_seconds:10}]};
 const call=async()=>galaxyAndroid({input:{action:'poll',branch:'imperatriz',ready:true,app_version:'1.5.8'},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 const result=await call();assert.equal(result.jobs[0].payload.command,'Olá, teste Unicode!');assert.equal(data.operations[0].state,'dispatched');data.operations[0].state='sent';
 const blocked={...data.operations[0],id:crypto.randomUUID(),state:'queued',command:'Olá\nteste'};data.operations.push(blocked);const second=await call();assert.equal(second.jobs.some(job=>job.id===blocked.id&&job.payload),false);assert.equal(data.operations.find(job=>job.id===blocked.id).state,'failed');
});

test('Android receipt evidence advances monotonically and cannot migrate a dispatched payload to another device',async()=>{
 const token='f'.repeat(64),device='1'.repeat(64),otherDevice='2'.repeat(64),id=crypto.randomUUID(),created_at=new Date().toISOString();
 let data={gateway:{token_hash:digest(token)},operations:[{id,kind:'sms',serial:'',phone:'99999999991',command:'Olá',actor:'test',created_at,state:'queued',target_type:'contact',contact_name:'Teste',batch_id:id,delay_seconds:10}]};
 const call=(input,device_id=device)=>galaxyAndroid({input:{branch:'imperatriz',app_version:'1.5.11',device_id,...input},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 const first=(await call({action:'poll',ready:true})).jobs.find(x=>x.payload);assert.equal(first.payload.id,id);
 assert.equal((await call({action:'poll',ready:true},otherDevice)).jobs.some(x=>x.payload),false);
 const retry=(await call({action:'poll',ready:true})).jobs.find(x=>x.payload);assert.deepEqual(retry.payload,first.payload);
 await call({action:'report',id,state:'received'});await call({action:'report',id,state:'sending'});
 await call({action:'report',id,state:'indeterminate'});await call({action:'report',id,state:'sent'});
 const delayed=await call({action:'report',id,state:'failed'});assert.equal(delayed.stale,true);assert.equal(data.operations[0].state,'sent');
 await call({action:'report',id,state:'delivered'});assert.equal(data.operations[0].state,'delivered');
 assert.equal((await call({action:'poll',ready:true})).jobs.some(x=>x.id===id&&x.payload),false);
});

test('later sent or delivered evidence repairs an earlier failed or expired receipt',async()=>{
 const token='7'.repeat(64),id=crypto.randomUUID(),created_at=new Date().toISOString();
 let data={gateway:{token_hash:digest(token)},operations:[{id,kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'test',created_at,state:'dispatched'}]};
 const call=input=>galaxyAndroid({input:{branch:'imperatriz',...input},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 await call({action:'report',id,state:'failed'});
 const sent=await call({action:'report',id,state:'sent'});assert.equal(sent.state,'sent');
 await call({action:'report',id,state:'failed'});assert.equal(data.operations[0].state,'sent');
 const delivered=await call({action:'report',id,state:'delivered'});assert.equal(delivered.state,'delivered');
 const stale=await call({action:'poll',ready:false,reports:[{id,state:'failed'}]});
 assert.equal(stale.report_results[0].report_state,'failed');assert.equal(stale.report_results[0].state,'delivered');
 assert.equal(data.operations[0].state,'delivered');
});

test('poll batches reports independently and still dispatches when one report is unknown',async()=>{
 const token='9'.repeat(64),device='8'.repeat(64),id=crypto.randomUUID(),fresh=crypto.randomUUID(),created_at=new Date().toISOString();
 let saves=0;let data={gateway:{token_hash:digest(token)},operations:[
  {id,kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'test',created_at,state:'dispatched',dispatched_at:created_at,dispatch_device_id:device,dispatch_retry_until:new Date(Date.now()+120000).toISOString(),dispatch_attempts:1},
  {id:fresh,kind:'sms',serial:'024000002',phone:'99999999998',command:'reset,123456',actor:'test',created_at,state:'queued'}
 ]};
 const call=input=>galaxyAndroid({input:{branch:'imperatriz',app_version:'1.5.11',device_id:device,...input},token,document:async()=>{const copy=structuredClone(data);return {data:copy,save:async()=>{saves++;data=copy}}},users:async()=>({users:[{active:true,username:'test',branches:[{id:'imperatriz'}],permissions:{owner:true}}]})});
 const response=await call({action:'poll',ready:true,reports:[{id,state:'received'},{id:'missing',state:'sent'}]});
 assert.equal(response.report_results[0].accepted,true);assert.equal(response.report_results[0].state,'received');
 assert.equal(response.report_results[1].accepted,false);assert.equal(response.report_results[1].finalized,true);assert.equal(response.jobs.some(x=>x.id===fresh&&x.payload),false); // prior dispatched job keeps this dispatch cycle serialized
 assert.equal(data.operations[0].state,'received');assert.equal(data.operations[1].state,'queued');assert.equal(saves,1);
});

test('unified session poll resolves each job to its source branch and serves the oldest branch queue first',async()=>{
 const device='a'.repeat(64),old=new Date(Date.now()-2000).toISOString(),fresh=new Date(Date.now()-1000).toISOString();
 const byBranch={imperatriz:{gateway:{ready:false,last_seen:'2026-01-01T00:00:00.000Z'},operations:[{id:'imp-job',kind:'sms',serial:'024000001',phone:'99999999999',command:'reset,123456',actor:'operator',created_at:old,state:'queued',batch_id:'imp-batch'}]},maraba:{gateway:{ready:true,last_seen:'2026-01-02T00:00:00.000Z'},operations:[{id:'mab-job',kind:'sms',serial:'024000002',phone:'99999999998',command:'reset,123456',actor:'operator',created_at:fresh,state:'queued',batch_id:'mab-batch'}]},araguaina:{operations:[]},acailandia:{operations:[]}};
 let gateway={scope:'all',ready:false,last_seen:null};const branches=['imperatriz','maraba','araguaina','acailandia'];
 const document=async branch=>{const data=structuredClone(byBranch[branch]);return{data,save:async()=>{byBranch[branch]=structuredClone(data);}};};
 const users=async()=>({users:[{active:true,username:'operator',branches:branches.map(id=>({id})),permissions:{owner:true}}]});
 const call=async input=>galaxyAndroidUnified({input:{app_version:'1.5.11',device_id:device,...input},mobileUser:'operator',gateway,branches,document,users,saveGateway:async value=>{gateway=structuredClone(value);}});
 await call({action:'heartbeat'});
 const first=await call({action:'poll',ready:true});
 const firstPayload=first.jobs.find(job=>job.payload).payload;
 assert.equal(firstPayload.id,'imp-job');assert.equal(firstPayload.branch,'imperatriz');
 const mismatch=await call({action:'poll',ready:true,reports:[{id:'imp-job',state:'received',branch:'maraba',device_id:device}]});
 assert.equal(mismatch.report_results[0].accepted,false);assert.equal(byBranch.imperatriz.operations[0].state,'dispatched');
 const received=await call({action:'poll',ready:true,reports:[{id:'imp-job',state:'received',branch:'imperatriz',device_id:device}]});
 assert.equal(received.report_results[0].accepted,true);assert.equal(received.report_results[0].branch,'imperatriz');
 assert.equal(received.jobs.find(job=>job.id==='imp-job').branch,'imperatriz');
 const wrongDevice=await call({action:'poll',ready:true,reports:[{id:'imp-job',state:'sent',branch:'imperatriz',device_id:'b'.repeat(64)}]});
 assert.equal(wrongDevice.report_results[0].accepted,false);assert.equal(byBranch.imperatriz.operations[0].state,'received');
 await call({action:'poll',ready:true,reports:[{id:'imp-job',state:'sent',branch:'imperatriz',device_id:device}]});
 const next=await call({action:'poll',ready:true});
 const nextPayload=next.jobs.find(job=>job.payload).payload;
 assert.equal(nextPayload.id,'mab-job');assert.equal(nextPayload.branch,'maraba');
 assert.equal(byBranch.maraba.operations[0].state,'dispatched');
 assert.deepEqual(byBranch.imperatriz.gateway,{ready:false,last_seen:'2026-01-01T00:00:00.000Z'});
 assert.deepEqual(byBranch.maraba.gateway,{ready:true,last_seen:'2026-01-02T00:00:00.000Z'});
});

test('unified session reports must include the branch resolved from the payload',async()=>{
 const branches=['imperatriz','maraba'],gateway={scope:'all',ready:false,last_seen:null};let data={imperatriz:{operations:[]},maraba:{operations:[{id:'mab-job',kind:'sms',serial:'024000002',phone:'99999999998',command:'reset,123456',actor:'operator',created_at:new Date().toISOString(),state:'dispatched'}]}};
 const document=async branch=>{const copy=structuredClone(data[branch]);return{data:copy,save:async()=>{data[branch]=structuredClone(copy);}};};
 const call=input=>galaxyAndroidUnified({input,mobileUser:'operator',gateway,branches,document,users:async()=>({users:[{active:true,username:'operator',branches:branches.map(id=>({id})),permissions:{owner:true}}]}),saveGateway:async()=>{}});
 await assert.rejects(call({action:'report',id:'mab-job',state:'sent'}),e=>e.status===400);
 const result=await call({action:'poll',ready:false,reports:[{id:'mab-job',state:'sent'}]});
 assert.equal(result.report_results[0].accepted,false);assert.equal(data.maraba.operations[0].state,'dispatched');
});

test('global gateway receives authorized branch jobs from another operator while legacy sessions stay actor-scoped',async()=>{
 const device='c'.repeat(64),job={id:'shared-job',kind:'sms',serial:'024000009',phone:'99999999999',command:'reset,123456',actor:'sender',created_at:new Date().toISOString(),state:'queued',batch_id:'shared-batch'};
 const branches=['imperatriz'],users=async()=>({users:[
  {active:true,username:'gateway',branches:[{id:'imperatriz'}],permissions:{owner:true}},
  {active:true,username:'sender',branches:[{id:'imperatriz'}],permissions:{writes:['sms']}}
 ]});
 const legacy={gateway:{},operations:[structuredClone(job)]};
 const old=await galaxyAndroid({input:{action:'poll',branch:'imperatriz',ready:true,app_version:'1.5.12',device_id:device},mobileUser:'gateway',document:async()=>({data:legacy,save:async()=>{}}),users});
 assert.equal(old.jobs.some(item=>item.id===job.id),false);
 const docs={imperatriz:{gateway:{},operations:[structuredClone(job)]}};let gateway={scope:'all',ready:false};
 const unified=async input=>galaxyAndroidUnified({input:{action:'poll',ready:true,app_version:'1.5.12',device_id:device,...input},mobileUser:'gateway',gateway,branches,document:async branch=>({data:docs[branch],save:async()=>{}}),users,saveGateway:async value=>{gateway=structuredClone(value);}});
 const dispatched=await unified({});
 assert.equal(dispatched.jobs.find(item=>item.payload)?.payload.id,job.id);
 assert.equal(dispatched.jobs.find(item=>item.payload)?.branch,'imperatriz');
 const receipt=await unified({reports:[{id:job.id,branch:'imperatriz',device_id:device,state:'received'}]});
 assert.equal(receipt.report_results[0].accepted,true);
 assert.equal(receipt.report_results[0].branch,'imperatriz');
});
