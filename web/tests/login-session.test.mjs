import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {api} from '../backend/api.mjs';
import {passwordHash} from '../backend/auth.mjs';
test('explicit login creates only a session cookie even for an old remember request',async()=>{
 let duration,output,status;const headers={};
 const pool={query:async(sql,args)=>{if(sql.includes('login_limits'))return {rows:[{attempts:1}]};if(sql.startsWith('select * from central_homologacao.users'))return {rows:[{id:'fixture',password_hash:passwordHash('test-only')}]};if(sql.startsWith('insert into central_homologacao.sessions'))duration=args[3];return {rows:[]};}};
 const req=Readable.from([JSON.stringify({username:'fixture',password:'test-only',remember:true})]);Object.assign(req,{url:'/api/login',method:'POST',headers:{host:'localhost',origin:'http://localhost'},socket:{remoteAddress:'127.0.0.1'}});
 await api(pool)(req,{setHeader:(k,v)=>headers[k]=v,writeHead:s=>status=s,end:s=>output=JSON.parse(s)});
 assert.equal(status,200);assert.match(output.csrf,/^[a-f0-9]{64}$/);assert.equal(duration,'12 hours');assert.match(headers['Set-Cookie'],/HttpOnly/);assert.doesNotMatch(headers['Set-Cookie'],/Max-Age|Expires/);
});
