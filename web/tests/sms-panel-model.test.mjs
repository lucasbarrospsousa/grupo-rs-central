import test from 'node:test';import assert from 'node:assert/strict';
import {smsCounts,smsResultRows,smsInProgress} from '../public/sms-panel-model.js';
const states=['queued','pending','received','sending','sent','delivered','failed','expired','indeterminate','cancelled'];
const rows=states.map((state,i)=>({id:String(i),state,serial:'02400000'+i,payload:{phone:'+559999999000'+i}}));
test('all states preserved in queue or results, delivered counted once within sent',()=>{assert.deepEqual(smsCounts(rows),[4,2,1,3]);assert.equal(rows.filter(smsInProgress).length+smsResultRows(rows).length,rows.length);assert.ok(smsResultRows(rows).some(r=>r.state==='cancelled'));});
test('filters by exact state, attention, series and formatted phone without changing original',()=>{const before=JSON.stringify(rows);assert.equal(smsResultRows(rows,'','sent').length,1);assert.equal(smsResultRows(rows,'','attention').length,3);assert.equal(smsResultRows(rows,'024000005')[0].state,'delivered');assert.equal(smsResultRows(rows,'+55 (99) 99999-0005')[0].state,'delivered');assert.equal(smsResultRows(rows,'missing').length,0);assert.equal(JSON.stringify(rows),before);});
