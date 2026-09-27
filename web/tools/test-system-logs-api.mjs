import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createPool} from '../backend/database.mjs';
import {hash} from '../backend/auth.mjs';
import {api} from '../backend/api.mjs';
const pool=createPool(),c=await pool.connect();let checks=0;
const verify=v=>{assert.ok(v);checks++;};
const bound={query:(...args)=>c.query(...args),connect:async()=>({release(){},async query(sql,args){
 if(/^BEGIN/i.test(sql))return c.query('SAVEPOINT request_transaction');
 if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT request_transaction');
 if(sql==='ROLLBACK')return c.query('ROLLBACK TO SAVEPOINT request_transaction');
 return c.query(sql,args);
}})};
const handler=api(bound,{integrationService:{}});let sid=randomBytes(32).toString('hex'),csrf=hash(sid+':csrf');
async function call(path,method='GET',data){let status,result;const headers={};const req={url:'/api/'+path,method,headers:{host:'localhost',origin:'http://localhost',cookie:'central_session='+sid,'x-csrf-token':csrf,'idempotency-key':randomUUID()},socket:{remoteAddress:'audit-test'},async *[Symbol.asyncIterator](){if(data)yield JSON.stringify(data);}};
 await handler(req,{setHeader(k,v){headers[k]=v;},writeHead(s){status=s;},end(v){result=JSON.parse(v);}});return {status,result,headers};}
try{
 await c.query('BEGIN');
 const owner=(await c.query("select id from central_homologacao.users where username='lucasabm'")).rows[0];
 await c.query("insert into central_homologacao.sessions(token_hash,user_id,csrf_hash,expires_at) values($1,$2,$3,now()+interval '5 minutes')",[hash(sid),owner.id,hash(csrf)]);
 let r=await call('logs');verify(r.status===200&&Array.isArray(r.result.rows));
 const serial='999'+String(Date.now()).slice(-10),created=await call('devices?branch=imperatriz','POST',{data:{serial,status:'Reserva',model:'Audit QA'}});verify(created.status===200);
 const changed=await call('devices/'+created.result.id+'?branch=imperatriz','PATCH',{version:1,data:{status:'Manutenção'}});verify(changed.status===200&&!changed.headers['X-Central-Audit']);
 r=await call('logs?q='+serial);verify(r.result.rows.some(x=>x.username==='lucasabm'&&x.details.status?.before==='Reserva'&&x.details.status?.after==='Manutenção'));
 r=await call('logs?from=2026-02-31');verify(r.status===400);
 const id=randomUUID();await c.query("insert into central_homologacao.users(id,username,password_hash) values($1,$2,'test-only')",[id,'audit-reader-'+Date.now()]);await c.query("insert into central_homologacao.memberships(user_id,branch_id,role) values($1,'imperatriz','reader')",[id]);
 sid=randomBytes(32).toString('hex');csrf=hash(sid+':csrf');await c.query("insert into central_homologacao.sessions(token_hash,user_id,csrf_hash,expires_at) values($1,$2,$3,now()+interval '5 minutes')",[hash(sid),id,hash(csrf)]);
 r=await call('logs');verify(r.status===403);
 r=await call('ui-event','POST',{module:'users',action:'OPEN'});verify(r.status===403);
 r=await call('ui-event','POST',{module:'stock',action:'OPEN'});verify(r.status===200);
 r=await call('devices/'+created.result.id+'?branch=imperatriz','DELETE',{version:2});verify(r.status===403);
 const failures=(await c.query("select count(*)::int n from central_homologacao.system_logs where user_id=$1 and outcome='failure'",[id])).rows[0];verify(failures.n>0);
 await c.query('SAVEPOINT check_delete');try{await c.query('delete from central_homologacao.system_logs where false');throw Error('Unexpected privilege');}catch(e){verify(e.code==='42501');}await c.query('ROLLBACK TO SAVEPOINT check_delete');
 await c.query('ROLLBACK');console.log(JSON.stringify({checks,runtimeRole:true,api:true,ownerOnly:true,beforeAfter:true,rollback:true}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
