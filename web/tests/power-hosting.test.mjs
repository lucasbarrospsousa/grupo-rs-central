import test from 'node:test';import assert from 'node:assert/strict';import worker from '../hosting/worker.mjs';
test('homepage shows shutdown only from authoritative state, fails closed, and serves assets while on',async()=>{
 const old=globalThis.fetch;let state='off',reads=0;
 globalThis.fetch=async(url,opts)=>{assert.match(url,/internal\/power-state$/);assert.equal(opts.headers['x-central-bridge'],'fixture');reads++;return state==='failed'?new Response('',{status:503}):Response.json({state});};
 const env={CENTRAL_BRIDGE_TOKEN:'fixture',ASSETS:{fetch:async()=>new Response('original')}};
 try{let r=await worker.fetch(new Request('https://central.test/'),env);assert.equal(r.status,503);assert.match(await r.text(),/desligada/);
 state='on';r=await worker.fetch(new Request('https://central.test/'),env);assert.equal(r.status,200);assert.equal(await r.text(),'original');
 state='failed';assert.equal((await worker.fetch(new Request('https://central.test/'),env)).status,503);
 await worker.fetch(new Request('https://central.test/logo.png'),env);assert.equal(reads,3);
 }finally{globalThis.fetch=old;}
});
