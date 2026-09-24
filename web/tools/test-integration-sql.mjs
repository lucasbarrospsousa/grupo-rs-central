// Real SQL, disposable identities/rows, synthetic external service. Never calls a platform.
import assert from 'node:assert/strict';import http from 'node:http';import {randomUUID,randomBytes} from 'node:crypto';
import {createPool} from '../backend/database.mjs';import {passwordHash} from '../backend/auth.mjs';import {api} from '../backend/api.mjs';
const admin=createPool({admin:true}),runtime=createPool(),uid=randomUUID(),rid=randomUUID(),deviceIds=[];const suffix=randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');let calls=0,confirmed=false,changed=false;
const service={binding:async()=>({ok:!changed,plate:'ABC1D23',client:'Synthetic',source:'synthetic'}),prepareLink:async(branch,serial,plate)=>({confirmed,serial,plate,payload:{synthetic:true}}),createLink:async()=>{calls++;throw Error('synthetic timeout');}};
const server=http.createServer(api(runtime,{integrationService:service}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let cookie='',csrf='',count=0;const check=(x,m)=>{assert.ok(x,m);count++;console.log('PASS '+m);};
async function call(path,method='GET',body,key=randomUUID()){const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':key},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
async function device(status){const id=randomUUID(),serial='98'+String(Date.now()).slice(-7);deviceIds.push(id);await admin.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,'imperatriz',serial,{status}]);return id;}
try{
 for(const [id,role] of [[uid,'admin'],[rid,'reader']]){await admin.query('insert into central_homologacao.users(id,username,password_hash) values($1,$2,$3)',[id,'integration-'+role+'-'+suffix,passwordHash(password)]);await admin.query('insert into central_homologacao.memberships values($1,$2,$3)',[id,'imperatriz',role]);}
 let login=await call('login','POST',{username:'integration-admin-'+suffix,password});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];csrf=login.data.csrf;
 check((await call('integrations/binding?branch=maraba&serial=024000001')).status===403,'integration denies other branch');
 check((await call('integrations/sms?branch=imperatriz','POST',{})).status===503,'SMS explicitly paused');
 const id=await device('Estoque'),body={id,version:1,plate:'ABC1D23',client:'Synthetic'},key=randomUUID();
 changed=true;check((await call('integrations/discharge?branch=imperatriz','POST',body,key)).status===409,'changed remote binding blocks local discharge');changed=false;
 const d=await call('integrations/discharge?branch=imperatriz','POST',body,key);check(d.status===200,'confirmed discharge updates isolated SQL row');
 check((await call('integrations/discharge?branch=imperatriz','POST',body,key)).data.version===2,'discharge replay does not duplicate');
 check((await call('integrations/discharge?branch=imperatriz','POST',body)).status===409,'stale discharge rejected');
 const target=await device('Reserva'),link={id:target,version:1,plate:'AAA - 099',confirmed:true};
 const first=await call('integrations/link?branch=imperatriz','POST',link);check(first.status===200&&first.data.pending&&calls===1,'timeout preserved as pending after one remote POST');
 const repeated=await call('integrations/link?branch=imperatriz','POST',link);check(repeated.data.pending&&calls===1,'repeated link never repeats uncertain remote POST');
 confirmed=true;const reconciled=await call('integrations/reconcile?branch=imperatriz','POST',{id:first.data.id});check(reconciled.data.ok&&calls===1,'read reconciliation commits confirmed stock');
 check((await call('integrations/reconcile?branch=imperatriz','POST',{id:first.data.id})).data.ok&&calls===1,'reconciliation replay is harmless');
 const row=(await admin.query('select data,version from central_homologacao.devices where id=$1',[target])).rows[0];check(row.data.status==='Estoque'&&row.data.client==='RS300'&&row.version===2,'confirmed link updates SQL exactly once');
 check((await admin.query("select count(*)::int n from central_homologacao.audit_events where user_id=$1 and action='CONFIRM_LINK'",[uid])).rows[0].n===1,'completion audit written exactly once');
 login=await call('login','POST',{username:'integration-reader-'+suffix,password});cookie=login.cookie.split(';')[0];csrf=login.data.csrf;check((await call('integrations/discharge?branch=imperatriz','POST',body)).status===403,'reader cannot discharge');check((await call('integrations/link?branch=imperatriz','POST',link)).status===403,'reader cannot link');
 console.log('Integration SQL checks passed: '+count);
}finally{
 await admin.query('delete from central_homologacao.remote_operations where user_id=any($1::uuid[])',[[uid,rid]]);
 await admin.query('delete from central_homologacao.audit_events where user_id=any($1::uuid[])',[[uid,rid]]);await admin.query('delete from central_homologacao.requests where user_id=any($1::uuid[])',[[uid,rid]]);
 if(deviceIds.length)await admin.query('delete from central_homologacao.devices where id=any($1::uuid[])',[deviceIds]);await admin.query('delete from central_homologacao.users where id=any($1::uuid[])',[[uid,rid]]);
 server.closeAllConnections();await new Promise(r=>server.close(r));await runtime.end();await admin.end();
}
