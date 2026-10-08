import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createPool} from '../backend/database.mjs';import {startAutoLink,runAutoLink,nextLinkTarget} from '../backend/auto-link.mjs';
const serial='999'+String(Date.now());
const admin=createPool({admin:true}),c=await admin.connect(),uid=randomUUID(),id=randomUUID(),user={user_id:uid};
const pool={connect:async()=>({query:(sql,args)=>['BEGIN','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[]}):c.query(sql,args),release(){}})};
try{
 await c.query('begin');
 for(let i=0;i<4;i++){
 const branch='qa-auto-'+randomUUID();await c.query('insert into central_homologacao.branches values($1,$2)',[branch,'QA automatic sequence']);let reads=0;
 const owner=async()=>{reads++;return{id:'123'}};
 const first=await nextLinkTarget(c,branch,'AAA',449,owner);assert.equal(first.number,450);
 await c.query("update central_homologacao.link_targets set state='occupied' where branch_id=$1 and prefix='AAA'",[branch]);
 const next=await nextLinkTarget(c,branch,'AAA',450,owner);assert.equal(next.number,451);
 assert.equal((await nextLinkTarget(c,branch,'AAA',449,owner)).number,451);
 assert.equal((await nextLinkTarget(c,branch,'GRS',449,owner)).number,450);
 assert.equal((await nextLinkTarget(c,branch,'XRS',449,owner)).number,450);assert.equal(reads,1);
 }
 console.log('PASS automatic numbering: four isolated bases, first use, next number, reuse and independent prefixes; owner resolved once/base.');
 await c.query('insert into central_homologacao.users(id,username,password_hash,active) values($1,$2,$3,false)',[uid,'qa-link-'+uid,'disabled']);
 await c.query("insert into central_homologacao.memberships values($1,'imperatriz','operator')",[uid]);
 await c.query("insert into central_homologacao.devices(id,branch_id,serial,data) values($1,'imperatriz',$2,$3)",[id,serial,{status:'Manutenção',model:'V7.2.2'}]);
 await c.query("insert into central_homologacao.device_codes(device_id,serial,equipment_id,state) values($1,$2,'99999999','unlinked')",[id,serial]);
 await c.query("update central_homologacao.link_targets set state='occupied' where branch_id='imperatriz'");
 for(const n of [999990,999991])await c.query("insert into central_homologacao.link_targets(branch_id,prefix,number,plate,vehicle_id,client_id) values('imperatriz','AAA',$1,$2,$3,'1')",[n,'AAA - '+n,String(n)]);

 const args={pool,user,branch:'imperatriz',body:{id,version:1}};
 const op=await startAutoLink(args);assert.equal((await startAutoLink(args)).id,op.id);
 const calls=[];const service={linkSaved:async(b,e,v)=>{calls.push(v);return calls.length===1?{status:409,body:'{"message":"Veículo já possui outro equipamento"}'}:{status:200,body:'{"ok":true}'}}};
 await runAutoLink(op.id,{pool,user,service});assert.deepEqual(calls,['999990','999991']);
 assert.equal((await c.query('select state from central_homologacao.remote_operations where id=$1',[op.id])).rows[0].state,'confirmed');
 assert.equal((await c.query('select data from central_homologacao.devices where id=$1',[id])).rows[0].data.identification,'AAA - 999991');
 await runAutoLink(op.id,{pool,user,service});assert.equal(calls.length,2);
 await c.query("update central_homologacao.devices set data=data||'{\"status\":\"Manutenção\"}'::jsonb where id=$1",[id]);
 await c.query("insert into central_homologacao.link_targets(branch_id,prefix,number,plate,vehicle_id,client_id) values('imperatriz','AAA',999992,'AAA - 999992','999992','1')");
 const uncertain=await startAutoLink({...args,body:{id,version:2}});let sends=0;const timeout={linkSaved:async()=>{sends++;throw Error('Timeout')}};
 await runAutoLink(uncertain.id,{pool,user,service:{linkSaved:async()=>{throw Object.assign(Error('queue'),{requestNotSent:true,status:429});}}});
 const deferred=(await c.query('select state,payload,result from central_homologacao.remote_operations where id=$1',[uncertain.id])).rows[0];assert.equal(deferred.state,'submitted');assert.equal(deferred.payload.sent,false);assert.ok(deferred.payload.retry_at);assert.equal(deferred.result.reason,'queue_busy');assert.equal(sends,0);
 await runAutoLink(uncertain.id,{pool,user,service:timeout});await runAutoLink(uncertain.id,{pool,user,service:timeout});assert.equal(sends,1);const existing=await startAutoLink({...args,body:{id,version:2}});assert.equal(existing.id,uncertain.id);assert.equal(existing.state,'pending');assert.match(existing.message,/comunicação/);
 assert.equal((await c.query('select state from central_homologacao.remote_operations where id=$1',[uncertain.id])).rows[0].state,'pending');
 console.log('PASS transactional SQL: reservation, repeated click, occupied advances, confirmed saves, no repeated send; rollback');
}finally{await c.query('rollback');c.release();await admin.end();}
