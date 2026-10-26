import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WriteQueue} from './write-queue.mjs';
test('same document serializes; other branches continue; failures release lock',async()=>{
 const q=new WriteQueue();let release;const order=[];
 const first=q.run('a',async()=>{order.push(1);await new Promise(r=>release=r);throw Error('failed');});
 const second=q.run('a',async()=>order.push(2));
 await q.run('b',async()=>order.push(3));assert.deepEqual(order,[1,3]);release();
 await assert.rejects(first);await second;assert.deepEqual(order,[1,3,2]);assert.equal(q.queues.size,0);
});
test('expired and excess waiters never execute',async()=>{
 const q=new WriteQueue({limit:2,timeout:10});let release,calls=0;
 const first=q.run('a',()=>new Promise(r=>release=r));
 const expired=q.run('a',()=>calls++);await assert.rejects(q.run('a',()=>calls++),e=>e.status===429);
 await assert.rejects(expired,e=>e.status===429);release();await first;assert.equal(calls,0);
});
