// Opt-in measurement against the configured database. Synthetic business
// data rows remain in one outer transaction, invisible to others, then rollback.
// A temporary QA identity/session is committed for runtime access and removed.
// HTTP handler and runtime role are real; carrier is fake; COMMIT is a savepoint
// release, so these timings exclude durable commit and hosted Edge/browser costs.
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createPool} from '../backend/database.mjs';
import {api} from '../backend/api.mjs';
import {hash} from '../backend/auth.mjs';
if(!process.argv.includes('--rollback-only'))throw Error('Use --rollback-only explicitly');
const admin=createPool({admin:true}),runtime=createPool(),start=performance.now(),c=await runtime.connect();
const connectionMs=performance.now()-start,uid=randomUUID(),sid=randomBytes(32).toString('hex'),csrf=hash(sid+':csrf');
const samples=[],baseline=[],ids=[];let current=null,nested=false,carrierDelay=0,server;
const classify=sql=>/system_logs/.test(sql)?'response_audit':/audit_events/.test(sql)?'business_audit':/requests/.test(sql)?'idempotency':/^(sessions|user_permissions|memberships)$/.test(sql.match(/from central_homologacao\.(\w+)/i)?.[1]||'')?'authorization':/advisory/.test(sql)?'lock':/^(begin|commit|rollback)|set_config/i.test(sql)?'transaction':/^(insert|update|delete)/i.test(sql)?'write':'read';
const query=async(sql,args)=>{
 const t=performance.now(),category=classify(sql);let sent=sql;
 if(/^BEGIN/i.test(sql)){assert.equal(nested,false);nested=true;sent='SAVEPOINT operation';}
 else if(/^COMMIT/i.test(sql)){assert.equal(nested,true);nested=false;sent='RELEASE SAVEPOINT operation';}
 else if(/^ROLLBACK/i.test(sql)){nested=false;sent='ROLLBACK TO SAVEPOINT operation';}
 try{return await c.query(sent,args);}finally{current?.queries.push({category,ms:performance.now()-t});}
};
const pool={query,connect:async()=>({query,release(){}})};
const service={carrier:async(provider,iccid)=>{const t=performance.now();await new Promise(r=>setTimeout(r,carrierDelay));current.carrierMs+=performance.now()-t;return{ok:true,iccid,provider,operator:'TIM',phone:'5599999999999'};}};
async function call(label,path,method='GET',body){
 current={label,queries:[],carrierMs:0};const t=performance.now();
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`,{method,headers:{Origin:`http://127.0.0.1:${server.address().port}`,Cookie:'central_session='+sid,'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},body:body?JSON.stringify(body):undefined});
 const text=await response.text(),data=JSON.parse(text);assert.equal(response.status,200,`${label}: HTTP ${response.status}`);
 current.totalMs=performance.now()-t;current.bytes=Buffer.byteLength(text);current.rows=data.rows?.length??null;
 samples.push(current);console.log(label,Math.round(current.totalMs)+'ms',current.queries.length+' SQL');current=null;return data;
}
try{
 await c.query('BEGIN');
 await admin.query('insert into central_homologacao.users(id,username,password_hash) values($1,$2,$3)',[uid,'qa-profile-'+uid,'unusable-test-password']);
 await admin.query("insert into central_homologacao.memberships values($1,'imperatriz','admin')",[uid]);
 await admin.query('insert into central_homologacao.user_permissions(user_id,views,writes) values($1,$2,$2)',[uid,['stock','warehouse','maintenance']]);
 await admin.query("insert into central_homologacao.sessions(token_hash,user_id,csrf_hash,expires_at) values($1,$2,$3,now()+interval '10 minutes')",[hash(sid),uid,hash(csrf)]);

 for(let i=0;i<3;i++){const t=performance.now();await c.query('select 1');baseline.push(performance.now()-t);}
 const handler=api(pool,{integrationService:service});server=http.createServer((q,s)=>handler(q,s));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(let round=0;round<2;round++){
  const serial='999'+String(Date.now()).slice(-6),iccid='89999'+String(Date.now()).padStart(15,'0');
  assert.equal((await c.query('select 1 from central_homologacao.devices where serial=$1 union all select 1 from central_homologacao.warehouse_items where serial=$2',[serial,iccid])).rowCount,0,'Synthetic identifier collision; abort');
  const chip=await call('chip.create','warehouse?branch=imperatriz','POST',{kind:'chip',serial:iccid,provider:'arya'});ids.push(chip.id);
  await call('warehouse.reload','warehouse?branch=imperatriz');
  await call('chip.update','warehouse/'+chip.id+'?branch=imperatriz','PATCH',{classification:'Reserva',version:1});
  await call('warehouse.reload','warehouse?branch=imperatriz');
  await call('chip.delete','warehouse/'+chip.id+'?branch=imperatriz','DELETE',{version:2});
  await call('warehouse.reload','warehouse?branch=imperatriz');
  const device=await call('device.create','devices?branch=imperatriz','POST',{data:{serial,status:'Estoque',model:'QA ficticio'}});ids.push(device.id);
  await call('stock.reload','devices?branch=imperatriz');
  await call('device.update','devices/'+device.id+'?branch=imperatriz','PATCH',{version:1,data:{model:'QA alterado'}});
  await call('stock.reload','devices?branch=imperatriz');
  await call('device.delete','devices/'+device.id+'?branch=imperatriz','DELETE',{version:2});
  await call('stock.reload','devices?branch=imperatriz');
 }
 carrierDelay=1000;
 const delayed=await call('chip.create.carrier_1s','warehouse?branch=imperatriz','POST',{kind:'chip',serial:'89998'+String(Date.now()).padStart(15,'0'),provider:'arya'});ids.push(delayed.id);
}finally{
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 await c.query('ROLLBACK');
 await admin.query('delete from central_homologacao.users where id=$1',[uid]);
 const remaining=(await admin.query('select (select count(*) from central_homologacao.users where id=$1)+(select count(*) from central_homologacao.devices where id=any($2::uuid[]))+(select count(*) from central_homologacao.warehouse_items where id=any($2::uuid[])) as n',[uid,ids])).rows[0];
 assert.equal(Number(remaining.n),0);c.release();await runtime.end();await admin.end();
}
const report={scope:'local HTTP + real SQL, rollback only; carrier simulated; no hosted Edge/browser timing; savepoint instead of durable commit',connectionMs,baseline,samples,cleanup:'verified zero fixtures'};
if(process.env.PROFILE_OUTPUT)writeFileSync(process.env.PROFILE_OUTPUT,JSON.stringify(report,null,2));
console.log('ROLLBACK verified; aggregate timings only.');
