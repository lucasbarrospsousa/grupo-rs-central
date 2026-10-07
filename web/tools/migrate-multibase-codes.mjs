import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect(),q=(s,a=[])=>c.query(s,a);
const branches=['imperatriz','araguaina','acailandia','maraba'];
const sql=await readFile(new URL('../migrations/036_multibase_codes.sql',import.meta.url),'utf8');
try{
 const version=Number((await q('select max(version) v from central_homologacao.migrations')).rows[0].v);assert.ok([35,36].includes(version));
 await q('begin');if(version===35)await q(sql.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 assert.equal((await q('select count(*) n from central_homologacao.code_scan_branches')).rows[0].n,'4');
 await q("update central_homologacao.code_scan_branches set enabled=true,nightly_enabled=false,lease=null,lease_until=null,next_at=null,batch_limit=10");
 const leases={},devices={};
 for(const branch of branches){
  const id=randomUUID(),serial='999'+Date.now()+branches.indexOf(branch);devices[branch]={id,serial};
  await q("insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,'{\"status\":\"Reserva\",\"identification\":\"XRS - 99887\"}')",[id,branch,serial]);
  assert.equal((await q('select * from central_homologacao.code_scan_candidates($1) where id=$2',[branch,id])).rowCount,1);
  const lease=randomUUID();leases[branch]=lease;
  const batch=(await q('select central_homologacao.code_scan_claim($1,$2) d',[branch,lease])).rows[0].d;assert.ok(batch.rows.length>0&&batch.rows.length<=10);
  assert.equal((await q('select central_homologacao.code_scan_claim($1,$2) d',[branch,randomUUID()])).rows[0].d.rows.length,0,'same-base overlap blocked');
  await q('update central_homologacao.code_scan_branches set batch_ids=ARRAY[$2::uuid] where branch_id=$1',[branch,id]);
 }
 assert.equal((await q('select count(*) n from central_homologacao.code_scan_branches where lease is not null')).rows[0].n,'4','four independent active leases');
 const payload={state:'confirmed',equipment_id:'99887',vehicle_id:'77665',api_plate:'XRS - 99887',apn:'linksolutions.br',iccid:'8955000000000000099'};
 for(const branch of branches){const {id,serial}=devices[branch];
  const foreign=leases[branches[(branches.indexOf(branch)+1)%4]];
  assert.equal((await q('select central_homologacao.code_scan_save($1,$2,$3,$4) ok',[foreign,id,serial,payload])).rows[0].ok,false,'foreign lease rejected');
  assert.equal((await q('select central_homologacao.code_scan_save($1,$2,$3,$4) ok',[leases[branch],id,serial,payload])).rows[0].ok,true);
  await q('select central_homologacao.code_scan_save($1,$2,$3,$4)',[leases[branch],id,serial,{state:'error',message:'Synthetic timeout'}]);
  const saved=(await q('select equipment_id,apn from central_homologacao.device_codes where device_id=$1',[id])).rows[0];assert.equal(saved.equipment_id,'99887');assert.equal(saved.apn,'linksolutions.br');
  assert.equal((await q('select * from central_homologacao.code_scan_candidates($1) where id=$2',[branch,id])).rowCount,0,'existing devices wait until night');
  await q("update central_homologacao.code_scan_branches set nightly_enabled=true,night_start=((now() at time zone 'America/Fortaleza')-interval '1 hour')::time,night_end=((now() at time zone 'America/Fortaleza')+interval '1 hour')::time,review_cycle=9,review_started_at=now(),review_completed_at=null where branch_id=$1",[branch]);
  assert.equal((await q('select * from central_homologacao.code_scan_candidates($1) where id=$2',[branch,id])).rowCount,1,'night eligible per base');
  const status=(await q('select central_homologacao.code_scan_status($1,NULL,0) d',[branch])).rows[0].d;assert.equal(status.branch_id,branch);assert.ok(status.total>0);
 }
 await q("select central_homologacao.code_scan_configure('araguaina',false,35)");
 assert.equal((await q("select enabled from central_homologacao.code_scan_branches where branch_id='imperatriz'")).rows[0].enabled,true,'pause isolated');
 await q('select central_homologacao.query_policy_configure(true,1,5,2,true,true,true)');
 assert.equal((await q("select enabled from central_homologacao.code_scan_branches where branch_id='araguaina'")).rows[0].enabled,false,'priority change preserves per-base pause');
 const monitor=(await q('select central_homologacao.settings_monitor() d')).rows[0].d;assert.equal(monitor.scans.length,4);assert.ok(monitor.scans.every(s=>!s.rows));
 // A manual hold in one base must not occupy another base's API allowance.
 await q('delete from central_homologacao.api_v2_leases');await q('delete from central_homologacao.query_waiters');
 await q("update central_homologacao.api_v2_budget set next_at='-infinity',automatic_at='-infinity',manual_until='-infinity'");
 await q('update central_homologacao.code_scan_branches set enabled=true');await q('update central_homologacao.query_policy set priority=true');
 for(const branch of branches){const r=(await q("select central_homologacao.query_claim($1,$2,'automatic','codes') d",[branch,randomUUID()])).rows[0].d;assert.equal(r.wait_ms,0,'independent budget '+branch);}
 for(const sig of ['code_scan_status(text,text,integer)','code_scan_claim(text,uuid)','capture_device_codes(text,text,jsonb)'])assert.equal((await q("select has_function_privilege('anon',$1,'execute') ok",['central_homologacao.'+sig])).rows[0].ok,false);
 await q('rollback');
 if(process.argv.includes('--apply')&&version===35)await q(sql);
 console.log(JSON.stringify({checks:'4 leases, per-base batch caps, overlap rejection, foreign lease rejection, saved codes/APN, nighttime eligibility, independent pause and API allowance, scoped status, restricted permissions',rolledBack:true,applied:process.argv.includes('--apply')}));
}finally{await q('rollback').catch(()=>{});c.release();await pool.end();}
