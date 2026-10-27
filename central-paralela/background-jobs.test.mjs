import test from 'node:test';import assert from 'node:assert/strict';import {BackgroundJobs} from './background-jobs.mjs';
test('server jobs disabled by default, explicit activation, durable progress, completion delay and permission revocation',async()=>{let now=1000,calls=0;const m=new Map(),s={get:async k=>m.get(k),put:async(k,v)=>m.set(k,structuredClone(v)),list:async()=>m,setAlarm:async n=>s.alarm=n},u={active:true,username:'a',permissions:{owner:true},branches:[{id:'b'}]},deps={storage:s,now:()=>now,users:async()=>({users:[u]}),run:async j=>{calls++;return {finished:j.cursor===1};}};let jobs=new BackgroundJobs(deps);await jobs.alarm();assert.equal(calls,0);await assert.rejects(jobs.configure({action:'configure',enabled:true,kind:'status',branch:'b',serials:['024000001']},u));await jobs.configure({action:'configure',enabled:true,confirmed:true,kind:'status',branch:'b',serials:['024000001','024000002']},u);now=s.alarm;await jobs.alarm();jobs=new BackgroundJobs(deps);now=s.alarm;await jobs.alarm();assert.equal(calls,2);assert.equal(s.alarm-now,30000);u.active=false;now=s.alarm;await jobs.alarm();assert.equal(calls,2);assert.equal(m.get('job:b:status').enabled,false);});

test('global collectors reject incomplete branch authorization and duplicate scheduling by another branch',async()=>{
 const jobs=new BackgroundJobs({storage:{get:async()=>null},users:async()=>({users:[]}),run:async()=>{}}),user={permissions:{owner:true},branches:[{id:'imperatriz'},{id:'maraba'}]};
 await assert.rejects(jobs.configure({branch:'imperatriz',kind:'costs',action:'configure',enabled:true,confirmed:true},user),e=>e.status===403);
 await assert.rejects(jobs.configure({branch:'maraba',kind:'warehouse-links',action:'read'},user),e=>e.status===400);
});

test('night window crosses midnight and never schedules external calls outside it',async()=>{
 const {nextWindow}=await import('./background-jobs.mjs'),job={kind:'codes',nightly_enabled:true,night_start:'22:00',night_end:'06:00'};
 for(const time of ['2026-10-26T23:00:00-03:00','2026-10-27T05:59:00-03:00'])assert.equal(nextWindow(job,Date.parse(time)),Date.parse(time));
 assert.equal(nextWindow(job,Date.parse('2026-10-27T06:00:00-03:00')),Date.parse('2026-10-27T22:00:00-03:00'));
});
