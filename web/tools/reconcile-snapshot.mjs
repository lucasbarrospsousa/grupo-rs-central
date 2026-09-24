import {DatabaseSync} from 'node:sqlite';
import {createPool,privatePath} from '../backend/database.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const map={imperatriz:'imperatriz',backups_araguaina:'araguaina',backups_acailandia:'acailandia',backups_maraba:'maraba'};
const meta=JSON.parse(readFileSync(privatePath('cutover-audit.json'))),verified=JSON.parse(readFileSync(privatePath('sql-backup-latest.json')));
if(!verified.restoreVerified||Date.now()-Date.parse(verified.at)>3600000)throw Error('A recent verified SQL backup is required');
const baseline=new DatabaseSync(privatePath('snapshot-20260924.sqlite'),{readOnly:true}),source=new DatabaseSync(meta.snapshot,{readOnly:true});
const canonical=row=>{const raw=JSON.parse(row.raw_json||'{}'),serial=[row.imei,raw.equipment_number,raw.imei,row.sku].find(v=>typeof v==='string'&&/^\d{6,17}$/.test(v)),branch=map[row.branch_id];return{serial,branch,identification:raw.identification_plate||'',plate:raw.vehicle_plate||row.plate||'',client:raw.client||'',carrier:row.carrier||raw.operator||'',model:row.model||'',status:row.status,iccid:row.iccid||raw.chip_number||'',phone:raw.chip_phone||'',apn:raw.apn||'',installed_at:raw.installed_at||'',created_at:row.created_at||'',updated_at:row.updated_at||'',communication:'Não consultado',connectivity:'Não consultado'};};
const equal=(a,b)=>JSON.stringify(a,Object.keys(a).sort())===JSON.stringify(b,Object.keys(b).sort());
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('BEGIN');await c.query('lock table central_homologacao.devices,central_homologacao.legacy_records in share row exclusive mode');
 if((await c.query("select 1 from central_homologacao.remote_operations where state in ('prepared','submitted','pending') limit 1")).rowCount)throw Error('Pending remote operations must be reconciled first');
 const digest=createHash('sha256').update(readFileSync(meta.snapshot)).digest('hex');
 if((await c.query('select 1 from central_homologacao.imports where source_hash=$1',[digest])).rowCount)throw Error('Snapshot already reconciled; no changes');
 const owner=(await c.query("select u.id from central_homologacao.users u where active and username not like 'qa_%' order by created_at limit 1")).rows[0];if(!owner)throw Error('Owner unavailable');
 let updated=0,added=0,history=0;const previous=new Map(baseline.prepare('select * from devices').all().filter(r=>map[r.branch_id]).map(r=>[r.id,r]));
 for(const row of source.prepare('select * from devices').all().filter(r=>map[r.branch_id])){
  const prior=previous.get(row.id),next=canonical(row);if(!next.serial)throw Error('Invalid canonical serial');
  if(prior&&equal(canonical(prior),next))continue;
  const existing=(await c.query('select * from central_homologacao.devices where branch_id=$1 and source_id=$2',[next.branch,row.id])).rows[0];
  if(existing){if(!prior||existing.deleted_at||existing.version!==1||!equal(existing.data,canonical(prior)))throw Error('Conflict with web changes; nothing applied');await c.query('update central_homologacao.devices set data=$2,version=version+1,updated_at=now() where id=$1',[existing.id,next]);updated++;}
  else{if(prior)throw Error('Source mapping missing');await c.query('insert into central_homologacao.devices(id,branch_id,source_id,serial,data) values($1,$2,$3,$4,$5)',[randomUUID(),next.branch,row.id,next.serial,next]);added++;}
 }
 const activeIds=new Set(source.prepare('select id from devices').all().map(r=>r.id));if([...previous.keys()].some(id=>!activeIds.has(id)))throw Error('Desktop removal requires explicit reconciliation');
 const importId=randomUUID();await c.query('insert into central_homologacao.imports(id,source_hash,counts) values($1,$2,$3)',[importId,digest,{kind:'final-reconciliation',updated,added}]);
 for(const table of ['maintenance','movements']){
  const before=new Map(baseline.prepare('select * from '+table).all().map(r=>[r.id,r]));
  for(const row of source.prepare('select * from '+table).all().filter(r=>map[r.branch_id])){
   if(before.has(row.id)){if(before.get(row.id).raw_json!==row.raw_json)throw Error('Changed history requires reconciliation');continue;}
   await c.query('insert into central_homologacao.legacy_records values($1,$2,$3,$4,$5)',[importId,table,row.id,map[row.branch_id],JSON.parse(row.raw_json||'{}')]);history++;
  }
 }
 await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',['imperatriz',owner.id,'FINAL_RECONCILIATION',importId,{updated,added,history,sourceHash:digest}]);
 await c.query('COMMIT');const result={at:new Date().toISOString(),updated,added,history,sourceHash:digest,backup:verified.file};writeFileSync(privatePath('cutover-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({updated,added,history,committed:true}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{baseline.close();source.close();c.release();await pool.end();}
