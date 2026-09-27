import test from 'node:test';
import assert from 'node:assert/strict';
import {createBudget,retryDelay} from '../public/usage-control.mjs';
test('shared rolling hour/day budget never admits above configured reservation',()=>{let now=100000000,stored=null;const opts={read:()=>stored,write:s=>stored=s,now:()=>now,limits:{hour:3,day:5}},a=createBudget(opts),b=createBudget(opts);assert.ok(a.claim(2));assert.ok(b.claim());assert.equal(a.claim(),false);now+=3600001;assert.ok(b.claim(2));assert.equal(a.claim(),false);now+=86400000;assert.ok(a.claim(3));assert.equal(b.snapshot().day,3);});
test('pause survives controller recreation; manual requests are outside admission',()=>{let stored=null;const opts={read:()=>stored,write:s=>stored=s};const a=createBudget(opts);a.pause(true);const b=createBudget(opts);assert.equal(b.claim(),false);b.pause(false);assert.ok(a.claim());});
test('malformed storage and blocked storage retain safe in-memory limits',()=>{for(const value of ['broken','{"events":[null,{}, {"at":9,"cost":-1}]}']){const b=createBudget({read:()=>value,write:()=>{throw Error('blocked')},limits:{hour:1,day:1}});assert.ok(b.claim());assert.equal(b.claim(),false);}});
test('invalid costs do not create credit',()=>{const b=createBudget();for(const cost of [0,-1,NaN,Infinity,1.5])assert.equal(b.claim(cost),false);assert.equal(b.snapshot().day,0);});
test('failure backoff is bounded and resets after success',()=>{assert.equal(retryDelay(120000,0),120000);assert.equal(retryDelay(120000,1),240000);assert.equal(retryDelay(120000,9),1800000);});
