import test from 'node:test';import assert from 'node:assert/strict';
import {tlsRequest} from '../backend/integrations.mjs';
test('hosted TLS preserves Authorization spelling and decodes fragmented chunked HTTP',async()=>{
 const previous=globalThis.Deno;let written='',closed=false,offset=0;
 const response=Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\ntest\r\n0\r\n\r\n');
 globalThis.Deno={connectTls:async options=>{assert.equal(options.hostname,'example.com');assert.equal(options.port,443);assert.equal(options.caCerts,undefined);return{write:async b=>{written+=Buffer.from(b.subarray(0,7)).toString();return Math.min(7,b.length);},read:async out=>{if(offset===response.length)return null;const n=Math.min(5,response.length-offset);out.set(response.subarray(offset,offset+n));offset+=n;return n;},close:()=>{closed=true;}};}};
 try{const r=await tlsRequest('https://example.com/data',{method:'GET',headers:{Authorization:'Bearer fixture'}});assert.equal(r.status,200);assert.equal(Buffer.concat(r.body).toString(),'test');assert.match(written,/\r\nAuthorization: Bearer fixture\r\n/);assert.ok(closed);}finally{globalThis.Deno=previous;}
});
test('hosted TLS rejects truncated chunks and closes connection',async()=>{
 const previous=globalThis.Deno;let read=false,closed=false;const response=Buffer.from('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n9\r\nshort');
 globalThis.Deno={connectTls:async()=>({write:async b=>b.length,read:async b=>{if(read)return null;read=true;b.set(response);return response.length;},close:()=>{closed=true;}})};
 try{await assert.rejects(tlsRequest('https://example.com/data',{method:'GET',headers:{}}),/Incomplete chunk/);assert.ok(closed);}finally{globalThis.Deno=previous;}
});
