import test from 'node:test';import assert from 'node:assert/strict';import {stockRounds} from '../public/stock-rounds.js';
const tick=()=>new Promise(r=>setImmediate(r));
function clock(){let now=0,id=0;const jobs=new Map();return {schedule:(fn,ms)=>{jobs.set(++id,{fn,at:now+ms});return id;},cancel:id=>jobs.delete(id),advance:async ms=>{now+=ms;for(const [id,j] of [...jobs])if(j.at<=now){jobs.delete(id);j.fn();}await tick();},jobs};}
test('waits 1.3s, streams chip and communication independently, one device at a time, waits 30s after completion',async()=>{
 const t=clock(),calls=[],pending=[],seen=[];const q=stockRounds({...t,query:(id,kind,signal)=>{calls.push([id,kind]);return new Promise(resolve=>pending.push({id,kind,signal,resolve}));},onResult:(id,kind)=>seen.push([id,kind])});
 q.set(['a','b']);await t.advance(1299);assert.equal(calls.length,0);await t.advance(1);assert.equal(calls.length,2);
 pending.find(p=>p.kind==='chips').resolve({});await tick();assert.deepEqual(seen,[['a','chips']]);assert.equal(calls.length,2);
 pending.find(p=>p.kind==='locations').resolve({});await tick();assert.equal(calls.length,4);q.set(['a','b']);
 pending.filter(p=>p.id==='b').forEach(p=>p.resolve({}));await tick();await t.advance(29999);assert.equal(calls.length,4);await t.advance(1);assert.equal(calls.length,6);q.close();
});
test('page change cancels delayed and ongoing work; redraw and stale responses never restart or update the new page',async()=>{
 const t=clock(),pending=[],seen=[];const q=stockRounds({...t,query:(id,kind,signal)=>new Promise(resolve=>pending.push({id,kind,signal,resolve})),onResult:id=>seen.push(id)});
 q.set(['a']);await t.advance(1000);q.set(['b']);await t.advance(300);assert.equal(pending.length,0);await t.advance(1000);assert.equal(pending.length,2);
 q.set(['c']);assert.ok(pending.every(p=>p.signal.aborted));pending.forEach(p=>p.resolve({}));await tick();assert.deepEqual(seen,[]);q.close();await t.advance(50000);assert.equal(pending.length,2);
});
test('hidden/offline/pause cancels work; errors do not loop and empty pages make no requests',async()=>{
 const t=clock();let calls=0;const seen=[];const q=stockRounds({...t,query:async()=>{calls++;throw Error('offline');},onResult:(_id,_kind,result)=>seen.push(result)});
 q.set([]);await t.advance(50000);assert.equal(calls,0);q.set(['a']);q.pause(true);await t.advance(50000);assert.equal(calls,0);q.pause(false);await t.advance(1300);assert.equal(calls,2);assert.equal(seen.length,2);q.set(['a']);await t.advance(29999);assert.equal(calls,2);q.suspend();await t.advance(50000);assert.equal(calls,2);q.close();
});
