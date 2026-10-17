import test from 'node:test';import assert from 'node:assert/strict';import {integrationRoute} from '../backend/integration-routes.mjs';
test('deleted visible device is removed without querying external provider',async()=>{
 const id='00000000-0000-4000-8000-000000000001';const c={query:async sql=>({rows:sql.includes('as cursor')?[{cursor:'2',changes:[{id,kind:'devices'}]}]:[]}),release(){}};
 const pool={query:async()=>({rows:[{role:'admin'}]}),connect:async()=>c};let result;
 const res={writeHead(){},end(v){result=JSON.parse(v)}};
 await integrationRoute({req:{method:'GET'},res,url:new URL('https://central/api/integrations/stock-page?branch=imperatriz&kind=locations&since=1&ids='+id),pool,user:{user_id:'test'},permissions:{owner:true},service:new Proxy({},{get(){throw Error('No external request allowed')}})});
 assert.deepEqual(result.savedChanges.removed,[id]);assert.equal(result.results[0].ok,false);
});
