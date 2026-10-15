import test from 'node:test';import assert from 'node:assert/strict';
import {withServerPower} from '../backend/server-power.mjs';
test('off blocks work; accepted requests release after success or failure',async()=>{
 let allowed=false;const calls=[];const pool={query:async(sql)=>{calls.push(sql);return{rows:[{power:{allowed,state:allowed?'on':'off'}}]};}};
 const off=await withServerPower(pool,()=>assert.fail('must not run'));assert.equal(off.status,503);assert.equal(calls.length,1);
 allowed=true;assert.equal(await withServerPower(pool,async()=>42),42);assert.match(calls.at(-1),/leave/);
 await assert.rejects(()=>withServerPower(pool,async()=>{throw Error('test');}),/test/);assert.match(calls.at(-1),/leave/);
});
test('background work keeps its lease until completion',async()=>{
 let release,finished;const calls=[];const pending=new Promise(r=>release=r);const pool={query:async sql=>{calls.push(sql);return{rows:[{power:{allowed:true,state:'on'}}]};}};
 await withServerPower(pool,async tasks=>{tasks.push(pending);return 1;},p=>finished=p);
 assert.equal(calls.length,1);release();await finished;assert.match(calls.at(-1),/leave/);
});
