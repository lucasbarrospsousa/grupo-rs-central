import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../hosting/cloudflare-entry.mjs';

test('production forwards operations only after origin validation and preserves backend authorization', async()=>{
 const previous=globalThis.fetch, calls=[];
 const origin='https://grupo-rs-central-avaliacao.lucasbarrospereira13.workers.dev';
 const env={CENTRAL_HOSTING_MODE:'production',CENTRAL_BRIDGE_TOKEN:'synthetic',ASSETS:{fetch:async()=>new Response('asset')}};
 globalThis.fetch=async(url,options)=>{calls.push({url,options,body:options.body?await new Response(options.body).text():null});return Response.json({error:'Permission denied by backend'},{status:403});};
 try {
  for(const method of ['POST','PUT','PATCH','DELETE']) {
   const response=await worker.fetch(new Request(origin+'/api/devices?id=fixture',{method,headers:{origin,cookie:'central_session=fixture','x-csrf-token':'csrf-fixture','idempotency-key':'unique-fixture','content-type':'application/json'},body:'{"fixture":true}'}),env);
   assert.equal(response.status,403);
   assert.equal((await response.json()).error,'Permission denied by backend');
   const call=calls.at(-1);
   assert.match(call.url,/supabase.co\/functions\/v1\/central-api\/api\/devices\?id=fixture$/);
   assert.equal(call.options.method,method);
   assert.equal(call.options.headers.get('cookie'),'central_session=fixture');
   assert.equal(call.options.headers.get('x-csrf-token'),'csrf-fixture');
   assert.equal(call.options.headers.get('idempotency-key'),'unique-fixture');
   assert.equal(call.options.headers.get('origin'),'https://grupo-rs-central.lucasbarrosp.chatgpt.site');
   assert.equal(call.body,'{"fixture":true}');
  }
  for(const source of ['', 'null','https://evil.example']) assert.equal((await worker.fetch(new Request(origin+'/api/devices',{method:'POST',headers:{origin:source},body:'{}'}),env)).status,403);
  assert.equal(calls.length,4);
  await worker.fetch(new Request(origin+'/api/warehouse?branch=maraba'),env);
  assert.equal(calls.length,5);
  assert.match(calls.at(-1).url,/branch=maraba$/);
  assert.equal((await worker.fetch(new Request(origin+'/api/session'),{...env,CENTRAL_BRIDGE_TOKEN:''})).status,503);
  assert.equal(calls.length,5);
 } finally {globalThis.fetch=previous;}
});
