import assert from 'node:assert/strict';import http from 'node:http';import {randomUUID} from 'node:crypto';
import {createPool} from '../backend/database.mjs';import {api} from '../backend/api.mjs';import {token,hash} from '../backend/auth.mjs';
const pool=createPool(),c=await pool.connect();let server;
try{
 await c.query('BEGIN');const user=(await c.query("select user_id from central_homologacao.memberships where branch_id='imperatriz' and role='admin' limit 1")).rows[0].user_id;
 await c.query("select set_config('central.user_id',$1,true)",[user]);const sid=token(),csrf=token();
 await c.query("insert into central_homologacao.sessions(token_hash,user_id,csrf_hash,expires_at) values($1,$2,$3,now()+interval '5 minutes')",[hash(sid),user,hash(csrf)]);
 const wrapper={query:(...args)=>c.query(...args),connect:async()=>({query:(sql,args)=>c.query(sql==='BEGIN'?'SAVEPOINT api_test':sql==='COMMIT'?'RELEASE SAVEPOINT api_test':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT api_test':sql,args),release:()=>{}})};
 const serial='998'+String(Date.now()).slice(-6),iccid='899998'+String(Date.now());
 const handler=api(wrapper,{integrationService:{stockDetails:async()=>({equipment:{serial,iccid,phone:'11999999999'}})}});
 server=http.createServer((q,s)=>handler(q,s));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const call=async(path,method='GET',body)=>{const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,Cookie:'central_session='+sid,'X-CSRF-Token':csrf,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json()};};
 const created=await call('devices?branch=imperatriz','POST',{data:{serial,status:'Manutenção'}});assert.equal(created.status,200);const path='devices/'+created.body.id+'?branch=imperatriz';
 const lookup=await call('integrations/stock?branch=imperatriz&serial='+serial);assert.equal(lookup.status,200);assert.equal(lookup.body.contacts.device.iccid,iccid);
 const read=await call(path);assert.equal(read.body.rows[0].phone,'11999999999');assert.equal(read.body.rows[0].iccid,iccid);
 const version=read.body.rows[0].version;const edit=await call(path,'PATCH',{version,data:{iccid,phone:'(11) 98888-8888'}});assert.equal(edit.status,200);assert.equal((await call(path)).body.rows[0].phone,'11988888888');
 assert.equal((await call(path,'PATCH',{version:edit.body.version,data:{iccid:'123'}})).status,400);
 assert.equal((await call(path,'PATCH',{version:edit.body.version,data:{phone:'123'}})).status,400);
 assert.equal((await call(path,'PATCH',{version:1,data:{phone:'11977777777'}})).status,409);
 console.log('PASS: runtime SQL, authenticated HTTP, real contact persistence, phone normalization, invalid fields and stale edits rejected; rolled back; no external writes');
}finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await c.query('ROLLBACK');c.release();await pool.end();}
