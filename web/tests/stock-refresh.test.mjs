import test from 'node:test';
import assert from 'node:assert/strict';
import {integrationRoute} from '../backend/integration-routes.mjs';

test('stock refresh returns current stored status and carrier for read-only users', async()=>{
 const fresh={id:'device-test',serial:'000001',branch_id:'imperatriz',version:2,data:{status:'Manutenção',carrier:'MULTI OPERADORA',iccid:'test-chip',phone:'test-phone'}};
 const queries=[];
 const c={query:async(sql)=>{queries.push(sql);return {rows:sql.startsWith('select id,serial,branch_id,data,version')?[fresh]:[]};},release(){}};
 const pool={query:async()=>({rows:[{role:'reader'}]}),connect:async()=>c};
 let result;
 await integrationRoute({req:{method:'GET'},res:{writeHead(){},end(body){result=JSON.parse(body);}},url:new URL('https://example.test/api/integrations/stock?branch=imperatriz&serial=000001'),pool,user:{user_id:'reader-test'},service:{stockDetails:async()=>({equipment:{serial:'000001'}})}});
 assert.equal(result.contacts.device.status,'Manutenção');
 assert.equal(result.contacts.device.carrier,'MULTI OPERADORA');
 assert.equal(result.contacts.device.version,2);
 assert.equal(result.contacts.device.iccid,'test-chip');
 assert.equal(result.contacts.device.phone,'test-phone');
 assert.ok(!queries.some(sql=>/^(update|insert|delete) /i.test(sql)));
});
