import {test} from 'node:test';import assert from 'node:assert/strict';import worker from './worker.mjs';
const origin='https://parallel.example';
const env={AUTH:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({csrf:'test'})})},ASSETS:{fetch:async()=>new Response('login')}};
test('static login and security headers',async()=>{const r=await worker.fetch(new Request(origin),env);assert.equal(await r.text(),'login');assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);});
test('operational API and foreign origin blocked',async()=>{for(const [path,options,status] of [['/api/devices',{},404],['/api/login',{method:'POST',headers:{origin:'https://evil.example'}},403],['/api/session',{method:'POST',headers:{origin}},405]])assert.equal((await worker.fetch(new Request(origin+path,options),env)).status,status);});
test('only new cookie, trusted IP and CSRF reach auth binding',async()=>{const testEnv={...env,AUTH:{idFromName:x=>x,get:()=>({fetch:async req=>{assert.equal(req.headers.get('cookie'),'parallel_drive_session='+'a'.repeat(64));assert.equal(req.headers.get('x-parallel-ip'),'198.51.100.1');assert.equal(req.headers.get('x-csrf-token'),'csrf');return Response.json({ok:true});}})}};const r=await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'parallel_session=old; parallel_drive_session='+'a'.repeat(64),'x-csrf-token':'csrf','cf-connecting-ip':'198.51.100.1','x-parallel-ip':'forged'},body:'{}'}),testEnv);assert.equal(r.status,200);});
test('oversize body and missing binding fail closed',async()=>{assert.equal((await worker.fetch(new Request(origin+'/api/session'),{})).status,503);assert.equal((await worker.fetch(new Request(origin+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:'x'.repeat(4097)}),env)).status,413);});
test('Galaxy session without branch uses authorized branches; branch query preserves legacy scope',async()=>{
 const account={username:'operator',permissions:{owner:false,writes:['sms']},branches:['imperatriz','araguaina','acailandia','maraba'].map(id=>({id}))},calls=[];
 const testEnv={AUTH:{idFromName:id=>id,get:()=>({fetch:async()=>Response.json(account)})},OPERATIONS:{idFromName:id=>id,get:()=>({fetch:async request=>{calls.push(await request.json());return Response.json({ok:true});}})}};
 const run=(url,body={action:'poll',ready:true})=>worker.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/json',cookie:'parallel_drive_session='+'a'.repeat(64)},body:JSON.stringify(body)}),testEnv);
 assert.equal((await run(origin+'/api/galaxy')).status,200);
 assert.equal(calls[0].mobileGlobal,true);assert.deepEqual(calls[0].mobileBranches,['imperatriz','araguaina','acailandia','maraba']);assert.equal(calls[0].input.branch,undefined);
 assert.equal((await run(origin+'/api/galaxy',{action:'report',branch:'maraba',id:'job',state:'sent'})).status,200);
 assert.equal(calls[1].mobileGlobal,true);assert.equal(calls[1].input.branch,'maraba');
 assert.equal((await run(origin+'/api/galaxy?branch=imperatriz')).status,200);
 assert.equal(calls[2].mobileGlobal,false);assert.equal(calls[2].input.branch,'imperatriz');
});
