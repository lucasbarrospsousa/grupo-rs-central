import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gatewayPresence} from './gateway-presence.mjs';
import {whatsappQueue} from './whatsapp-queue.mjs';
test('presence checkpoints reduce writes without losing live status or dispatch receipts',async()=>{
 let now=100000,writes=0;const data=new Map();
 const storage={get:async k=>structuredClone(data.get(k)),put:async(k,v)=>{writes++;data.set(k,structuredClone(v));},list:async()=>new Map([...data].filter(([k])=>k.startsWith('wa:job:'))),async transaction(fn){return fn(this);}};
 const cached=gatewayPresence(storage,()=>now);
 const poll={action:'gateway-poll',deviceStatus:{ok:true,connected:true,accessibilityActive:true}};
 for(let i=0;i<60;i++){now=100000+i*1000;await whatsappQueue(cached,poll,now);}
 assert.equal(writes,2);
 assert.equal((await(await whatsappQueue(cached,{action:'status'},now)).json()).lastHeartbeat,now);
 const send={action:'send',requestId:'one',phone:'5599999999999',message:'SIMULATED'};
 assert.equal((await whatsappQueue(cached,send,now)).status,202);
 assert.equal((await(await whatsappQueue(cached,poll,now)).json()).job.id,'one');
 assert.equal(data.get('wa:job:one').status,'dispatched');
 assert.equal((await(await whatsappQueue(cached,poll,now)).json()).job,null);
 await whatsappQueue(cached,{...poll,deviceStatus:{...poll.deviceStatus,accessibilityActive:false}},now);
 assert.equal(data.get('wa:device').accessibilityActive,false);
});
