import {sendWarehouseActivation} from '../backend/warehouse-activation-send.mjs';
import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';import {warehouseActivation} from '../backend/warehouse-activation.mjs';
const pool=createPool({admin:true}),c=await pool.connect(),apply=process.argv.includes('--apply');
try{
 await c.query('BEGIN');await c.query("select pg_advisory_xact_lock(hashtext('warehouse-activation-migration'))");
 if(!(await c.query('select 1 from central_homologacao.migrations where version=48')).rowCount)await c.query((await readFile(new URL('../migrations/048_warehouse_activation.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 if(!(await c.query('select 1 from central_homologacao.migrations where version=49')).rowCount)await c.query((await readFile(new URL('../migrations/049_warehouse_activation_send.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await c.query('SAVEPOINT fixtures');
 const ids=[],stamp=String(Date.now());for(let i=0;i<21;i++){const id=randomUUID();ids.push(id);await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,classification,chip_provider,chip_phone,received_at) values($1,'imperatriz','chip',$2,'Disponível','Reserva','arya','',now())",[id,'8999'+stamp+String(i).padStart(2,'0')]);}
 let reads=0,mode='pending';const service={aryaRequest:async()=>({status:true,data:[],current_page:1,last_page:1,total_filtered:0}),carrier:async(provider,iccid)=>{reads++;if(mode==='error')throw Error('Falha simulada');return{ok:true,provider,iccid,status:mode==='active'?'ATIVO':mode==='numeric'?'2':'0',phone:mode==='active'?'5599999999999':''};}};
 const run=body=>warehouseActivation(c,{body,service,branch:'imperatriz',role:'admin'});
 await assert.rejects(run({action:'prepare',ids:ids.slice(0,10),size:10}),{status:400});
 const lot=await run({action:'prepare',ids:ids.slice(0,20),size:20,confirmed:true});assert.equal(lot.response.count,20);assert.equal(reads,20);
 await assert.rejects(run({action:'prepare',ids:ids.slice(0,10),size:10,confirmed:true}),{status:409});assert.equal(reads,20);
 await assert.rejects(run({action:'requested',batch:lot.id,confirmed:true,reference:''}),{status:400});
 await run({action:'requested',batch:lot.id,confirmed:true,reference:'TESTE-SIMULADO'});
 await assert.rejects(run({action:'requested',batch:lot.id,confirmed:true,reference:'TESTE-SIMULADO'}),{status:409});
 mode='error';assert.equal((await run({action:'check',batch:lot.id})).response.errors,20);
 mode='numeric';assert.equal((await run({action:'check',batch:lot.id})).response.confirmed,0);
 mode='active';assert.equal((await run({action:'check',batch:lot.id})).response.confirmed,20);
 const before=reads;await run({action:'check',batch:lot.id});assert.equal(reads,before);
 const saved=(await c.query('select activation_state,chip_phone from central_homologacao.warehouse_items where id=$1',[ids[0]])).rows[0];assert.equal(saved.activation_state,'active');assert.equal(saved.chip_phone,'5599999999999');
 // Real SQL, simulated provider. Scoped commits release SAVEPOINTs inside this rollback-only fixture.
 const user=(await c.query("select user_id from central_homologacao.memberships where branch_id='imperatriz' and role='admin' limit 1")).rows[0];assert.ok(user);
 const fixturePool={connect:async()=>({release(){},query:(sql,p)=>c.query(sql==='BEGIN'?'SAVEPOINT dispatch':sql==='COMMIT'?'RELEASE SAVEPOINT dispatch':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT dispatch':sql,p)})};
 await c.query("update central_homologacao.warehouse_items set activation_state='prepared' where activation_batch=$1",[lot.id]);
 let posts=0;mode='pending';service.aryaRequest=async(path,p)=>{if(path==='/tickets/bulk/by-iccid'){posts++;assert.equal(p.type,3);assert.equal(p.iccids.length,20);return {status:true};}return {status:true,data:[],current_page:1,last_page:1,total_filtered:0};};
 const send=()=>sendWarehouseActivation({pool:fixturePool,user,role:'admin',branch:'imperatriz',body:{batch:lot.id,confirmed:true},service});
 assert.equal((await send()).state,'requested');await send();assert.equal(posts,1);
 assert.equal((await c.query("select count(*)::int as n from central_homologacao.warehouse_items where activation_batch=$1 and activation_state='requested'",[lot.id])).rows[0].n,20);
 await c.query('ROLLBACK TO SAVEPOINT fixtures');await c.query(apply?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({migration:49,applied:apply,syntheticFixturesRolledBack:true,externalActivationCalls:0,checks:'20 items, duplicates, confirmation, failures, completion, durable send SQL with mocked provider'}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
