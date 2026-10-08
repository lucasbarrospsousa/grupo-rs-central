// Disposable SQL fixtures; platform services are fake. Never uses a real branch/device.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPool} from '../backend/database.mjs';
import {startLinkBatch,claimLink,drainLinkQueue,cancelLinkQueue} from '../backend/auto-link-queue.mjs';
import {runAutoLink} from '../backend/auto-link.mjs';
const admin=createPool({admin:true}),pool=createPool(),uid=randomUUID(),user={user_id:uid};
const branches=['qa-link-'+randomUUID(),'qa-link-'+randomUUID()],devices=[];
try{
 await admin.query('insert into central_homologacao.users(id,username,password_hash) values($1,$2,$3)',[uid,'qa-link-'+uid,'disabled']);
 await admin.query("insert into central_homologacao.user_permissions values($1,array['stock'],array['stock'])",[uid]);
 for(const branch of branches){
  await admin.query('insert into central_homologacao.branches values($1,$2)',[branch,'QA isolated link queue']);
  await admin.query("insert into central_homologacao.memberships values($1,$2,'operator')",[uid,branch]);
  for(let n=0;n<6;n++){
   const id=randomUUID(),serial='999'+String(Date.now())+n;devices.push({id,serial,branch,version:1});
   await admin.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,branch,serial,{status:'Reserva',model:'V7.2.2'}]);
   await admin.query("insert into central_homologacao.device_codes(device_id,serial,equipment_id,state) values($1,$2,$3,'unlinked')",[id,serial,String(900000+n)]);
   await admin.query("insert into central_homologacao.link_targets(branch_id,prefix,number,plate,vehicle_id,client_id) values($1,'AAA',$2,$3,$4,'1')",[branch,999980+n,'AAA - '+(999980+n),String(999980+n)]);
  }
 }
 const first=devices.filter(d=>d.branch===branches[0]),second=devices.filter(d=>d.branch===branches[1]);
 const results=await Promise.all([0,1].map(()=>startLinkBatch({pool,user,branch:branches[0],body:{items:[...first,first[0],{id:randomUUID(),version:1}]}})));
 assert.equal(results[0].results.length,7);assert.equal(results[0].results.filter(r=>r.ok).length,6);
 assert.equal(new Set(results.flatMap(r=>r.results.filter(r=>r.ok).map(r=>r.id))).size,6);
 await startLinkBatch({pool,user,branch:branches[1],body:{items:second}});
 const reservations=(await admin.query('select branch_id,number,operation_id from central_homologacao.link_targets where branch_id=any($1)',[branches])).rows;
 assert.equal(new Set(reservations.map(r=>r.operation_id)).size,12);
 // Concurrent database clients, same base: only two claims, even with six requests.
 const claims=await Promise.all(Array.from({length:6},()=>claimLink({pool,user,branch:branches[0]})));
 assert.equal(claims.filter(Boolean).length,2);
 assert.ok(await claimLink({pool,user,branch:branches[1]}));
 // Expired claim is held for review, never returned to the send queue.
 const abandoned=claims.find(Boolean);
 await admin.query("update central_homologacao.remote_operations set updated_at=now()-interval '16 minutes' where id=$1",[abandoned.id]);
 await claimLink({pool,user,branch:branches[0]});
 assert.equal((await admin.query('select state from central_homologacao.remote_operations where id=$1',[abandoned.id])).rows[0].state,'pending');
 // Release only test claims that were never sent, for lane execution below.
 await admin.query("update central_homologacao.remote_operations set payload=payload-'claim'-'running_at' where branch_id=any($1) and state='submitted'",[branches]);
 const active=new Map(),max=new Map(),calls=new Map();let total=0,peak=0,release;const gate=new Promise(r=>release=r);const timer=setTimeout(release,20000);
 const service={linkSaved:async(branch,e,v)=>{const key=branch+':'+e;calls.set(key,(calls.get(key)||0)+1);active.set(branch,(active.get(branch)||0)+1);max.set(branch,Math.max(max.get(branch)||0,active.get(branch)));peak=Math.max(peak,++total);
  if(total===4){clearTimeout(timer);release();}await gate;await new Promise(r=>setTimeout(r,300));active.set(branch,active.get(branch)-1);total--;
  if(e==='900005')throw Error('Simulated lost response');return{status:200,body:'{"ok":true}'};
 }};
 await Promise.all(branches.flatMap(branch=>Array.from({length:3},()=>drainLinkQueue({pool,user,branch,service,budgetMs:120000}))));
 for(const branch of branches)assert.equal(max.get(branch),2);assert.ok(peak>=3,'different bases overlap');
 assert.ok([...calls.values()].every(n=>n===1));const count=calls.size;
 await Promise.all(branches.map(branch=>drainLinkQueue({pool,user,branch,service})));
 assert.equal(calls.size,count);
 const states=(await admin.query('select state,count(*)::int n from central_homologacao.remote_operations where branch_id=any($1) group by state',[branches])).rows;
 assert.equal(states.find(r=>r.state==='pending').n,3);assert.equal(states.find(r=>r.state==='confirmed').n,9);
 const again=(await admin.query("update central_homologacao.devices set data=data||'{\"status\":\"Manutenção\"}'::jsonb,version=version+1 where id in(select id from central_homologacao.devices where branch_id=$1 and data->>'status'='Estoque' limit 3) returning id,version",[branches[0]])).rows;
 for(let n=999986;n<=999989;n++)await admin.query("insert into central_homologacao.link_targets(branch_id,prefix,number,plate,vehicle_id,client_id) values($1,'AAA',$2,$3,$4,'1')",[branches[0],n,'AAA - '+n,String(n)]);
 const batch=await startLinkBatch({pool,user,branch:branches[0],body:{items:again}});assert.equal(batch.results.filter(r=>r.ok).length,3);
 let entered,finish;const enteredGate=new Promise(r=>entered=r),finishGate=new Promise(r=>finish=r);let cancellationSends=0;
 const work=runAutoLink(batch.results[0].id,{pool,user,service:{linkSaved:async()=>{cancellationSends++;entered();await finishGate;return{status:409,body:'{"message":"Veículo já possui outro equipamento"}'};}}});
 await enteredGate;
 const cancelled=await cancelLinkQueue({pool,user,branch:branches[0]});assert.equal(cancelled.cancelled,2);assert.equal(cancelled.inFlight,1);assert.equal(cancelled.uncertain,2);
 finish();await work;
 for(const r of batch.results){assert.equal((await admin.query('select state from central_homologacao.remote_operations where id=$1',[r.id])).rows[0].state,'cancelled');}
 await drainLinkQueue({pool,user,branch:branches[0],service:{linkSaved:async()=>{throw Error('Cancelled work must not be sent');}}});
 assert.equal(cancellationSends,1);
 assert.equal((await admin.query("select count(*)::int n from central_homologacao.link_targets where branch_id=$1 and number between 999986 and 999989 and state='available'",[branches[0]])).rows[0].n,3);
 console.log('PASS cancellation: queued work releases numbers, in-flight occupied stops retries, uncertain stays reserved, other base unaffected.');
 console.log('PASS: repeated batch, unique targets, partial validation, global 2/base across clients, independent bases, expiry and timeout never resend; fake services only.');
}finally{
 await pool.end();
 await admin.query('delete from central_homologacao.link_targets where branch_id=any($1)',[branches]);
 await admin.query('delete from central_homologacao.remote_operations where branch_id=any($1)',[branches]);
 await admin.query('delete from central_homologacao.device_codes where device_id=any($1::uuid[])',[devices.map(d=>d.id)]);
 await admin.query('delete from central_homologacao.device_observations where device_id=any($1::uuid[])',[devices.map(d=>d.id)]);
 await admin.query('delete from central_homologacao.devices where branch_id=any($1)',[branches]);
 await admin.query('delete from central_homologacao.audit_events where branch_id=any($1)',[branches]);
 await admin.query('delete from central_homologacao.memberships where user_id=$1',[uid]);
 await admin.query('delete from central_homologacao.user_permissions where user_id=$1',[uid]);
 await admin.query('delete from central_homologacao.users where id=$1',[uid]);
 await admin.query('delete from central_homologacao.system_logs where branch_id=any($1) or user_id=$2 or entity=$2::text or entity=$3',[branches,uid,'qa-link-'+uid]);
 await admin.query('delete from central_homologacao.branches where id=any($1)',[branches]);await admin.end();
}
