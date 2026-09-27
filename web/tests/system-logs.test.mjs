import test from 'node:test';
import assert from 'node:assert/strict';
import {requestEvent,audited,readLogs} from '../backend/system-logs.mjs';
test('audit never captures query text, payloads, tokens or credentials',()=>{
 const event=requestEvent({method:'POST',url:'/api/login?password=SECRET',body:{password:'SECRET'},headers:{cookie:'SECRET'}},401);
 assert.equal(event.outcome,'failure');assert.ok(!JSON.stringify(event).includes('SECRET'));
});
test('background heartbeats and audit reads do not recursively create events',()=>{
 for(const path of ['activity','session','logs','ui-event','integrations/health','integrations/sync-status'])assert.equal(requestEvent({method:'GET',url:'/api/'+path},200),null);
});
test('logs are owner-only including direct API calls',async()=>{
 await assert.rejects(readLogs(null,{owner:false},new URLSearchParams()),e=>e.status===403);
 await assert.rejects(readLogs(null,{owner:true},new URLSearchParams('from=2026-09-28&to=2026-09-01')),e=>e.status===400);
});
test('response is released after audit persistence with server identity',async()=>{
 const order=[],req={method:'POST',url:'/api/users',auditUser:{user_id:'id',username:'owner'}};
 const pool={async query(sql,values){assert.equal(values[1],'owner');order.push('saved');}};
 const res={setHeader(){},writeHead(code){assert.equal(code,200);},end(){order.push('sent');}};
 await audited(pool,async(_,r)=>{r.writeHead(200,{});r.end('{}');return true;})(req,res);
 assert.deepEqual(order,['saved','sent']);
});
test('audit write failure is surfaced without falsely failing a committed action',async()=>{
 const headers={};let output;const old=console.error;console.error=()=>{};
 try{await audited({query:async()=>{throw Error('private-secret')}},async(_,r)=>{r.writeHead(200);r.end('saved');})({method:'PATCH',url:'/api/devices/x'},{setHeader(k,v){headers[k]=v;},writeHead(){},end(v){output=v;}});}finally{console.error=old;}
 assert.equal(output,'saved');assert.equal(headers['X-Central-Audit'],'unavailable');
});
test('HTTP 200 with a negative provider result is not logged as success',async()=>{
 let saved;await audited({query:async(_,values)=>{saved=values;}},async(_,res)=>{res.writeHead(200);res.end('{"ok":false}');})({method:'GET',url:'/api/integrations/carrier'},{setHeader(){},writeHead(){},end(){}});
 assert.equal(saved[5],'failure');
});
