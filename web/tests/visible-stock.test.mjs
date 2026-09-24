import test from 'node:test';
import assert from 'node:assert/strict';
import {visibleStockQueue} from '../public/visible-stock.js';
const tick=()=>new Promise(r=>setImmediate(r));
test('only ten visible rows are queried and redraw does not create a loop',async()=>{
 const calls=[],results=[];let queue;queue=visibleStockQueue({query:async id=>{calls.push(id);return{id};},onResult:(id)=>{results.push(id);queue.set(Array.from({length:15},(_,i)=>i));}});
 queue.set(Array.from({length:15},(_,i)=>i));await tick();await tick();assert.equal(calls.length,10);assert.equal(results.length,10);queue.close();
});
test('changing page discards queued old rows and obsolete responses',async()=>{
 const calls=[],results=[],pending=new Map();const queue=visibleStockQueue({query:id=>{calls.push(id);return new Promise(r=>pending.set(id,r));},onResult:id=>results.push(id)});
 queue.set(['a','b','c']);await tick();queue.set(['x','y']);pending.get('a')({});pending.get('b')({});await tick();assert.deepEqual(calls,['a','b','x','y']);assert.deepEqual(results,[]);pending.get('x')({});pending.get('y')({});await tick();assert.deepEqual(results,['x','y']);queue.close();
});
test('failures are throttled; explicit refresh retries; leaving stops queued work',async()=>{
 let calls=0;const queue=visibleStockQueue({query:async()=>{calls++;throw Error('Unavailable');},onResult:()=>{}});queue.set(['a']);await tick();queue.set(['a']);await tick();assert.equal(calls,1);queue.set(['a'],true);await tick();assert.equal(calls,2);queue.close();queue.set(['b']);await tick();assert.equal(calls,2);
});
