// Disposable SQL rows only; all external integrations are simulated.
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,randomBytes} from 'node:crypto';
import {createPool} from '../backend/database.mjs';
import {passwordHash} from '../backend/auth.mjs';
import {api} from '../backend/api.mjs';
const admin=createPool({admin:true}),runtime=createPool(),uid=randomUUID(),name='qa-inventory-'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
const ids=[],visits=[],branch='imperatriz';let cookie='',csrf='',calls=0;
const handler=api(runtime,{integrationService:{lookupEquipment:async()=>{calls++;throw Error('Simulated offline');},equipmentPortal:async()=>{calls++;throw Error('Simulated offline');}}});
const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
async function call(path,method='GET',body,key=randomUUID()){const r=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':key},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
try{
 await admin.query('insert into central_homologacao.users(id,username,password_hash) values($1,$2,$3)',[uid,name,passwordHash(password)]);
 await admin.query("insert into central_homologacao.memberships values($1,$2,'operator')",[uid,branch]);
 await admin.query('insert into central_homologacao.user_permissions(user_id,views,writes) values($1,$2,$3)',[uid,['stock','maintenance'],['stock','maintenance']]);
 const login=await call('login','POST',{username:name,password});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];csrf=login.data.csrf;
 let serial;do{serial='99'+String(Math.floor(Math.random()*1e7)).padStart(7,'0');}while((await admin.query('select 1 from central_homologacao.devices where serial=$1',[serial])).rowCount);
 const iccid='8900000000'+serial;assert.equal((await admin.query("select 1 from central_homologacao.devices where deleted_at is null and data->>'iccid'=$1",[iccid])).rowCount,0);
 const data={serial,identification:'XRS - 999999',status:'Estoque',carrier:'Teste',iccid,phone:''};
 const created=await call('devices?branch='+branch,'POST',{data});assert.equal(created.status,200,JSON.stringify(created.data));ids.push(created.data.id);
 const key=randomUUID(),updated=await call('devices?branch='+branch,'POST',{data:{...data,carrier:'Teste atualizado'}},key);assert.equal(updated.status,200);assert.equal(updated.data.id,created.data.id);assert.equal(updated.data.version,2);
 const repeat=await call('devices?branch='+branch,'POST',{data:{...data,carrier:'Teste atualizado'}},key);assert.equal(repeat.data.version,2);
 assert.equal((await call('devices/'+created.data.id+'?branch='+branch,'PATCH',{version:1,data})).status,409);
 assert.equal((await call('integrations/inventory-counts?branch=araguaina')).status,403);
 const counts=await call('integrations/inventory-counts?branch='+branch);assert.equal(counts.status,200);assert.ok(Number.isInteger(counts.data.stock));assert.equal(counts.data.warehouse,undefined);
 const lookup=await call('integrations/equipment-lookup?branch='+branch+'&q='+serial);assert.equal(lookup.status,200);assert.equal(lookup.data.data.serial,serial);assert.match(lookup.data.warning,/offline/);
 const conflict=await call('devices?branch='+branch,'POST',{data:{...data,serial:'000'+serial.slice(3)}});assert.equal(conflict.status,409);
 const before=calls,report=await call('maintenance?branch='+branch,'POST',{manual:true,clientId:'',vehicleId:'',clientName:'QA isolado',plate:'DEM1A00',currentSerial:serial,vehicle:created.data.id,vehicleVersion:2,reason:'Sem comunicação',medium:'Consultor informou',notes:'QA descartável'});assert.equal(report.status,200,JSON.stringify(report.data));visits.push(report.data.id);assert.equal(calls,before);
 const saved=(await admin.query('select data from central_homologacao.visits where id=$1',[report.data.id])).rows[0].data;assert.equal(saved.identity_source,'manual');
 console.log('PASS SQL: upsert, idempotency, stale edit, branch isolation, scoped counts, saved lookup and manual maintenance without external queries.');
}finally{
 if(visits.length)await admin.query('delete from central_homologacao.visits where id=any($1::uuid[])',[visits]);
 await admin.query('delete from central_homologacao.audit_events where user_id=$1',[uid]);await admin.query('delete from central_homologacao.requests where user_id=$1',[uid]);
 if(ids.length)await admin.query('delete from central_homologacao.devices where id=any($1::uuid[])',[ids]);
 await admin.query('delete from central_homologacao.users where id=$1',[uid]);server.closeAllConnections();await new Promise(r=>server.close(r));await runtime.end();await admin.end();
}
