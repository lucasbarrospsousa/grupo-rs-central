import test from 'node:test';import assert from 'node:assert/strict';
import {businessMutation} from '../backend/business.mjs';
const serial='8955000000000000001';
test('warehouse verifies both providers and saves returned operator, never browser values',async()=>{
 for(const provider of ['arya','link']){
  const queries=[];const c={query:async(sql,params)=>{queries.push({sql,params});return{rows:[]};}};
  const result=await businessMutation(c,{path:'/api/warehouse',method:'POST',branch:'imperatriz',role:'admin',body:{kind:'chip',serial,provider,operator:'forged'},service:{carrier:async(p,id)=>{assert.equal(p,provider);assert.equal(id,serial);return{ok:true,provider,iccid:serial,operator:'VIVO',phone:'99999999999'};}}});
  assert.equal(result.response.ok,true);assert.deepEqual(queries[0].params.slice(4),[provider,'VIVO','99999999999','Estoque']);
 }
});
test('warehouse refuses absent, wrong, ambiguous provider results and missing operator without SQL writes',async()=>{
 for(const checked of [{ok:false},{ok:true,provider:'arya',iccid:serial,operator:'VIVO'},{ok:true,provider:'link',iccid:'8955000000000000002',operator:'VIVO'},{ok:true,provider:'link',iccid:serial,operator:''}]){
  await assert.rejects(businessMutation({query:()=>{throw Error('unexpected SQL');}},{path:'/api/warehouse',method:'POST',branch:'imperatriz',role:'admin',body:{kind:'chip',serial,provider:'link'},service:{carrier:async()=>checked}}),e=>e.status===422);
 }
});
test('warehouse preserves device registration without carrier consultation',async()=>{
 let queried=false;await businessMutation({query:async()=>{queried=true;return{};}},{path:'/api/warehouse',method:'POST',branch:'imperatriz',role:'admin',body:{kind:'device',serial:'024999991'},service:{carrier:()=>{throw Error('unexpected provider');}}});assert.ok(queried);
});
test('warehouse propagates access failure and rejects unsupported provider',async()=>{
 const args={path:'/api/warehouse',method:'POST',branch:'imperatriz',role:'admin',body:{kind:'chip',serial,provider:'link'},service:{carrier:async()=>{throw Object.assign(Error('Access unavailable'),{status:503});}}};
 await assert.rejects(businessMutation({},args),e=>e.status===503);
 await assert.rejects(businessMutation({},{...args,body:{...args.body,provider:'unknown'}}),e=>e.status===400);
});
