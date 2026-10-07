import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
const sql=await readFile(new URL('../migrations/035_nightly_monitor.sql',import.meta.url),'utf8');
try{
 const version=Number((await c.query('select max(version) v from central_homologacao.migrations')).rows[0].v);assert.ok([34,35].includes(version),'Unexpected schema');
 const before=(await c.query('select (select enabled from central_homologacao.code_scan_control) codes,(select enabled from central_homologacao.sync_control) stock,(select enabled from central_homologacao.maintenance_control) maintenance')).rows[0];
 await c.query('begin');if(version===34)await c.query(sql.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 // No HTTP calls: only synthetic rows, temporary state and rollback.
 const q=(sql,args=[])=>c.query(sql,args);
 for(const [time,open] of [['2026-10-07T21:59:59-03:00',false],['2026-10-07T22:00:00-03:00',true],['2026-10-08T00:00:00-03:00',true],['2026-10-08T03:59:59-03:00',true],['2026-10-08T04:00:00-03:00',false]]){
  const w=(await q("select * from central_homologacao.code_scan_window($1,'22:00','04:00')",[time])).rows[0];assert.equal(w.is_open,open,time);
 }
 const sameDay=(await q("select * from central_homologacao.code_scan_window('2026-10-07T13:00:00-03:00','12:00','15:00')")).rows[0];assert.equal(sameDay.is_open,true);
 const id=randomUUID(),serial='999'+Date.now();
 await q("insert into central_homologacao.devices(id,branch_id,serial,data) values($1,'imperatriz',$2,'{\"status\":\"Reserva\",\"identification\":\"XRS - 98765\"}')",[id,serial]);
 await q("update central_homologacao.code_scan_control set enabled=true,nightly_enabled=false,lease=null,lease_until=null,next_at=null,review_cycle=1,review_started_at=now(),review_completed_at=null");
 let candidates=(await q('select * from central_homologacao.code_scan_candidates() where id=$1',[id])).rows;assert.equal(candidates.length,1,'New devices eligible during daytime');
 const payload={state:'confirmed',equipment_id:'98765',vehicle_id:'87654',api_plate:'XRS - 98765',apn:'linksolutions.br',iccid:'8955000000000000099'};
 await q('select central_homologacao.code_scan_save(null,$1,$2,$3)',[id,serial,payload]);
 assert.equal((await q('select * from central_homologacao.code_scan_candidates() where id=$1',[id])).rowCount,0,'Existing devices not rechecked by day');
 await q("update central_homologacao.code_scan_control set nightly_enabled=true,night_start=((now() at time zone 'America/Fortaleza')-interval '1 hour')::time,night_end=((now() at time zone 'America/Fortaleza')+interval '1 hour')::time");
 assert.equal((await q('select * from central_homologacao.code_scan_candidates() where id=$1',[id])).rowCount,1,'Existing devices eligible at night');
 const lease=randomUUID();await q("update central_homologacao.code_scan_control set lease=$1,lease_until=now()+interval '1 minute',batch_ids=ARRAY[$2::uuid]",[lease,id]);
 assert.equal((await q('select central_homologacao.code_scan_save($1,$2,$3,$4) ok',[lease,id,serial,{state:'error',message:'Synthetic timeout'}])).rows[0].ok,true);
 const saved=(await q('select equipment_id,vehicle_id,apn,review_cycle from central_homologacao.device_codes where device_id=$1',[id])).rows[0];assert.equal(saved.equipment_id,'98765');assert.equal(saved.vehicle_id,'87654');assert.equal(saved.apn,'linksolutions.br');assert.equal(saved.review_cycle,'1');
 assert.equal((await q('select * from central_homologacao.code_scan_candidates() where id=$1',[id])).rowCount,0,'Attempt saved; no retry storm');
 await q('select central_homologacao.code_scan_save(null,$1,$2,$3)',[id,serial,{...payload,apn:''}]);assert.equal((await q('select apn from central_homologacao.device_codes where device_id=$1',[id])).rows[0].apn,'linksolutions.br');
 await q("update central_homologacao.code_scan_control set review_started_at=now()-interval '2 days',review_completed_at=null");await q('select central_homologacao.code_scan_prepare()');assert.equal((await q('select review_cycle from central_homologacao.code_scan_control')).rows[0].review_cycle,'1','Unfinished cycle resumes');
 await q("update central_homologacao.code_scan_control set review_completed_at=now()-interval '1 day'");await q('select central_homologacao.code_scan_prepare()');assert.equal((await q('select review_cycle from central_homologacao.code_scan_control')).rows[0].review_cycle,'2','Completed prior cycle starts new night');
 await q("select central_homologacao.code_scan_schedule(true,30,true,'22:00','04:00',4,true)");
 await q('update central_homologacao.code_scan_control set lease=null,lease_until=null,next_at=null');
 const batch=(await q('select central_homologacao.code_scan_claim($1) d',[randomUUID()])).rows[0].d;assert.ok(batch.rows.length<=4,'Batch cap respected');
 const blocked=(await q('select central_homologacao.code_scan_claim($1) d',[randomUUID()])).rows[0].d;assert.equal(blocked.rows.length,0,'No overlapping batches');
 const summary=(await q('select central_homologacao.settings_monitor() d')).rows[0].d;assert.equal(summary.branches.length,4);assert.ok(!summary.scan.rows);assert.equal(summary.scan.batch_limit,4);
 assert.equal((await q("select has_function_privilege('anon','central_homologacao.settings_monitor()','execute') ok")).rows[0].ok,false);
 assert.equal((await q("select has_function_privilege('central_homologacao_web','central_homologacao.settings_monitor()','execute') ok")).rows[0].ok,true);
 await q('rollback');
 if(process.argv.includes('--apply')&&version===34)await q(sql);
 const after=(await q('select (select enabled from central_homologacao.code_scan_control) codes,(select enabled from central_homologacao.sync_control) stock,(select enabled from central_homologacao.maintenance_control) maintenance')).rows[0];assert.deepEqual(after,before);
 console.log(JSON.stringify({checks:'window boundaries, immediate new devices, nighttime review, resume, data preservation, batch cap, lock, global monitor, runtime permissions',rolledBack:true,applied:process.argv.includes('--apply'),controlsPreserved:true}));
}finally{await c.query('rollback').catch(()=>{});c.release();await pool.end();}
