// Disposable identities and rows in central_homologacao only. Baseline is never edited.
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID,randomBytes } from 'node:crypto';
import { createPool } from '../backend/database.mjs';
import { passwordHash } from '../backend/auth.mjs';
import { api } from '../backend/api.mjs';
const admin=createPool({admin:true}),runtime=createPool();
const suffix=randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
const identities=[{id:randomUUID(),name:'qa-'+suffix,branch:'imperatriz',role:'admin'},
  {id:randomUUID(),name:'qa-reader-'+suffix,branch:'araguaina',role:'reader'}];
const handler=api(runtime,{integrationService:{carrier:async()=>({ok:false})}});const server=http.createServer((q,s)=>handler(q,s));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const baselineDevices=(await admin.query("select count(*)::int as n from central_homologacao.devices where branch_id='imperatriz' and deleted_at is null")).rows[0].n;
const baselineVisits=(await admin.query("select count(*)::int as n from central_homologacao.legacy_records where branch_id='imperatriz' and source_table='maintenance'")).rows[0].n;
const baselineWarehouse=(await admin.query("select kind,count(*)::int as n from central_homologacao.warehouse_items where branch_id='imperatriz' and deleted_at is null and status='Disponível' group by kind")).rows;
let passed=0; const check=(condition,message)=>{assert.ok(condition,message);passed++;console.log('PASS '+message);};
let cookie='',csrf='';
const bulkOwned=[];
async function call(path,method='GET',body,extra={}){
 const response=await fetch(origin+'/api/'+path,{method,headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID(),...extra},body:body?JSON.stringify(body):undefined});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
}
try{
 for(const u of identities){await admin.query('insert into central_homologacao.users(id,username,password_hash) values($1,$2,$3)',[u.id,u.name,passwordHash(password)]);await admin.query('insert into central_homologacao.memberships values($1,$2,$3)',[u.id,u.branch,u.role]);}
 check((await call('devices?branch=imperatriz')).status===401,'anonymous read denied');
 check((await call('login','POST',{username:identities[0].name,password:'wrong'})).status===401,'wrong password denied');
 const login=await call('login','POST',{username:identities[0].name,password,remember:true});
 check(login.status===200&&login.cookie.includes('HttpOnly')&&login.cookie.includes('SameSite=Strict'),'login and protected session cookie');
 cookie=login.cookie.split(';')[0];csrf=login.data.csrf;
 check((await call('session')).data.branches.length===1,'authorized branch list');
 check((await call('devices?branch=maraba')).status===403,'cross-branch read denied');
 const rows=await call('devices?branch=imperatriz');check(rows.status===200&&rows.data.rows.length===baselineDevices,'GET matches imported baseline');
 const history=await call('history?branch=imperatriz');check(history.status===200&&history.data.rows.filter(r=>r.source_table==='maintenance').length===baselineVisits,'maintenance history preserved');
 const warehouse=await call('warehouse?branch=imperatriz');check(warehouse.status===200&&warehouse.data.rows.filter(r=>r.kind==='device'&&r.status==='Disponível').length===baselineWarehouse.find(r=>r.kind==='device').n&&warehouse.data.rows.filter(r=>r.kind==='chip'&&r.status==='Disponível').length===baselineWarehouse.find(r=>r.kind==='chip').n,'warehouse reconciliation preserved');
 check(rows.data.rows.some(r=>r.serial.startsWith('024')),'leading zeros preserved');
 const data={serial:'999'+String(Date.now()).slice(-6),status:'Estoque',plate:'',identification:'QA',carrier:'Vivo',model:'Teste'};
 check((await call('devices?branch=imperatriz','POST',{data},{'X-CSRF-Token':'wrong'})).status===403,'CSRF denied');
 check((await call('devices?branch=imperatriz','POST',{data},{Origin:'https://example.invalid'})).status===403,'foreign origin denied');
 const key=randomUUID();const created=await call('devices?branch=imperatriz','POST',{data},{'Idempotency-Key':key});
 check(created.status===200,'POST inserts disposable device');
 const repeated=await call('devices?branch=imperatriz','POST',{data},{'Idempotency-Key':key});check(repeated.data.id===created.data.id,'POST retry is idempotent');
 check((await call('devices?branch=imperatriz','POST',{data:{...data,model:'changed'}},{'Idempotency-Key':key})).status===409,'idempotency payload mismatch denied');
 const endpoint='devices/'+created.data.id+'?branch=imperatriz';
 check((await call(endpoint,'PATCH',{version:1,data:{carrier:'Claro'}})).status===200,'PATCH updates partial fields');
 check((await call(endpoint,'PATCH',{version:1,data:{carrier:'TIM'}})).status===409,'stale write denied');
 check((await call(endpoint,'PUT',{version:2,data:{...data,model:'Replaced'}})).status===200,'PUT replaces mutable document');
 check((await call(endpoint,'PATCH',{version:3,data:{status:'Instalado'}})).status===422,'installation requires verified binding');
 const c=await runtime.connect();try{await c.query('BEGIN');await c.query("select set_config('central.user_id',$1,true)",[identities[0].id]);check((await c.query("select count(*)::int as n from central_homologacao.devices where branch_id='maraba'")).rows[0].n===0,'Postgres RLS independently blocks other branches');await c.query('ROLLBACK');}finally{c.release();}
 check((await call(endpoint,'DELETE',{version:3})).status===200,'DELETE creates recoverable tombstone');
 check((await admin.query('select deleted_at from central_homologacao.devices where id=$1',[created.data.id])).rows[0].deleted_at,'deleted row retained for recovery');
 check((await admin.query('select count(*)::int as n from central_homologacao.audit_events where user_id=$1',[identities[0].id])).rows[0].n===4,'CRUD audit written once per change');
 const visit=await call('maintenance?branch=imperatriz','POST',{vehicle:rows.data.rows[0].id,reason:'Sem comunicação',medium:'Consultor informou',notes:'Teste isolado',replacement:''});check(visit.status===200,'maintenance POST records new visit without changing stock');
 check((await call('maintenance/'+visit.data.id+'?branch=imperatriz','PATCH',{version:1,status:'Aguardando',notes:'QA atualizado'})).status===200,'maintenance PATCH updates versioned visit');
 check((await call('maintenance/'+visit.data.id+'?branch=imperatriz','PATCH',{version:1,status:'Concluída',notes:'stale'})).status===409,'maintenance stale update denied');
 const serialA='998'+String(Date.now()).slice(-6),serialB='997'+String(Date.now()).slice(-6);
 const bulk=await call('bulk?branch=imperatriz','POST',{rows:[{serial:serialA,plate:'',carrier:'Claro'},{serial:serialB,plate:'',carrier:'TIM'}]});
 if(bulk.data.ids)bulkOwned.push(...bulk.data.ids);
 check(bulk.status===200&&bulk.data.count===2,'bulk INSERT commits whole batch');
 const rejected=await call('bulk?branch=imperatriz','POST',{rows:[{serial:'996'+String(Date.now()).slice(-6),plate:'',carrier:'Claro'},{serial:serialA,plate:'',carrier:'Claro'}]});
 check(rejected.status===409,'bulk duplicate rolls back entire batch');
 const w=await call('warehouse?branch=imperatriz','POST',{kind:'device',serial:serialA});check(w.status===200,'warehouse POST persists item');
 const shipment=await call('warehouse-transfer?branch=imperatriz','POST',{items:[{id:w.data.id,version:1}],destination:'Teste isolado',note:'QA'});check(shipment.status===200,'warehouse transfer commits movement and item state');
 check((await call('warehouse-transfer?branch=imperatriz','POST',{items:[{id:w.data.id,version:1}],destination:'Teste isolado',note:'QA'})).status===409,'warehouse stale transfer denied');
 check((await call('warehouse?branch=imperatriz','POST',{kind:'chip',serial:'8955300000000000000'})).status===422,'chip registration blocked without official verification');
 check((await call('logout','POST',{})).status===200&&(await call('session')).status===401,'logout revokes session');
 cookie='';csrf='';const reader=await call('login','POST',{username:identities[1].name,password});cookie=reader.cookie.split(';')[0];csrf=reader.data.csrf;
 check((await call('devices?branch=araguaina','POST',{data})).status===403,'read-only user cannot mutate');
 console.log('SQL/API checks passed: '+passed);
}finally{
 // Delete only records attributable to the exact UUIDs created by this run.
 for(const u of identities){
  await admin.query('delete from central_homologacao.visits where id in (select entity_id from central_homologacao.audit_events where user_id=$1)',[u.id]);
  await admin.query('delete from central_homologacao.warehouse_movements where user_id=$1',[u.id]);
  await admin.query('delete from central_homologacao.warehouse_items where id in (select entity_id from central_homologacao.audit_events where user_id=$1)',[u.id]);
  if(bulkOwned.length)await admin.query('delete from central_homologacao.devices where id=any($1::uuid[])',[bulkOwned]);
  await admin.query('delete from central_homologacao.devices where id in (select entity_id from central_homologacao.audit_events where user_id=$1)',[u.id]);
  await admin.query('delete from central_homologacao.audit_events where user_id=$1',[u.id]);
  await admin.query('delete from central_homologacao.requests where user_id=$1',[u.id]);
  await admin.query('delete from central_homologacao.users where id=$1',[u.id]);
 }
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await runtime.end();await admin.end();
}
