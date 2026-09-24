import test from 'node:test';import assert from 'node:assert/strict';import {smsCounts} from '../public/sms-page.js';
test('SMS counts sent includes delivered but delivery requires explicit state',()=>assert.deepEqual(smsCounts(['sent','delivered','expired','indeterminate','waiting_gateway','failed'].map(state=>({state}))),[1,2,1,3]));
