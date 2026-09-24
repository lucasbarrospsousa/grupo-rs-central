// Additive migration. Never updates/deletes source or existing target records.
// Dry run by default; --apply explicitly imports new identities only.
import {DatabaseSync,backup} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {createPool,privatePath} from '../backend/database.mjs';
import {normalizeVisit} from '../public/maintenance-model.js';
const apply=process.argv.includes('--apply'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const source=new DatabaseSync('C:/GRUPO RS CENTRAL/database/grupo_rs_central.sqlite',{readOnly:true});
const snapshot=privatePath(`maintenance-source-${stamp}.sqlite`);
await backup(source,snapshot);source.close();
const copy=new DatabaseSync(snapshot,{readOnly:true});
if(copy.prepare('pragma integrity_check').get().integrity_check!=='ok')throw Error('Snapshot integrity failed');
const branchMap={imperatriz:'imperatriz',backups_araguaina:'araguaina',backups_acailandia:'acailandia',backups_maraba:'maraba'};
const rows=copy.prepare('select * from maintenance').all();copy.close();
const sourceHash=createHash('sha256').update(readFileSync(snapshot)).digest('hex');
const pool=createPool({admin:true}),c=await pool.connect(),counts={source:rows.length,visits:0,technicalPreserved:0,legacyAdded:0,visitsAdded:0,alreadyImported:0,historicalWithoutDevice:0,unknownBranch:0};
try{
 await c.query('BEGIN');await c.query("select pg_advisory_xact_lock(hashtext('central-maintenance-additive-import'))");
 const legacy=(await c.query("select * from central_homologacao.legacy_records where source_table='maintenance'")).rows;
 const visits=(await c.query('select * from central_homologacao.visits')).rows;
 const devices=(await c.query('select id,branch_id,serial from central_homologacao.devices where deleted_at is null')).rows;
 const targetBackup=privatePath(`maintenance-target-${stamp}.json`);
 writeFileSync(targetBackup,JSON.stringify({at:new Date().toISOString(),legacy,visits}),{flag:'wx'});
 const importId=randomUUID();let importCreated=false;
 for(const row of rows){
  const branch=branchMap[row.branch_id];if(!branch){counts.unknownBranch++;continue;}
  const raw=JSON.parse(row.raw_json),normalized=normalizeVisit(raw);
  const old=legacy.find(r=>r.branch_id===branch&&r.source_id===row.id);
  if(!old){
   if(apply){
    if(!importCreated){await c.query('insert into central_homologacao.imports(id,source_hash,counts) values($1,$2,$3)',[importId,createHash('sha256').update('maintenance:'+sourceHash).digest('hex'),{scope:'maintenance-additive'}]);importCreated=true;}
    await c.query('insert into central_homologacao.legacy_records(import_id,source_table,source_id,branch_id,data) values($1,$2,$3,$4,$5)',[importId,'maintenance',row.id,branch,raw]);
   }counts.legacyAdded++;
  }
  if(!normalized){counts.technicalPreserved++;continue;}counts.visits++;
  if(visits.some(v=>v.branch_id===branch&&v.data.source_table==='maintenance'&&v.data.source_id===row.id)){counts.alreadyImported++;continue;}
  const device=devices.find(d=>d.branch_id===branch&&d.serial===normalized.currentSerial);
  if(!device)counts.historicalWithoutDevice++;
  // Keep every original field; readable aliases do not erase the original snapshot.
  const data={...raw,...normalized,source_table:'maintenance',source_id:row.id,source_snapshot_hash:sourceHash,imported_at:new Date().toISOString()};
  if(apply)await c.query('insert into central_homologacao.visits(id,branch_id,device_id,data) values($1,$2,$3,$4)',[randomUUID(),branch,device?.id||null,data]);counts.visitsAdded++;
 }
 // Prove pre-existing target records remain byte-for-byte equivalent as JSON.
 const afterLegacy=(await c.query("select * from central_homologacao.legacy_records where source_table='maintenance'")).rows;
 const afterVisits=(await c.query('select * from central_homologacao.visits')).rows;
 for(const r of legacy)if(!afterLegacy.some(a=>a.import_id===r.import_id&&a.source_id===r.source_id&&JSON.stringify(a)===JSON.stringify(r)))throw Error('Existing legacy history changed; rollback');
 for(const r of visits)if(!afterVisits.some(a=>a.id===r.id&&JSON.stringify(a)===JSON.stringify(r)))throw Error('Existing visit changed; rollback');
 if(counts.unknownBranch)throw Error('Unresolved source mappings; import stopped without changes');
 if(importCreated)await c.query('update central_homologacao.imports set counts=$2 where id=$1',[importId,counts]);
 await c.query(apply?'COMMIT':'ROLLBACK');
 writeFileSync(privatePath(`maintenance-import-${stamp}.json`),JSON.stringify({apply,counts,sourceHash,snapshot,targetBackup,existingPreserved:true},null,2),{flag:'wx'});
 console.log(JSON.stringify({apply,counts,existingPreserved:true}));
}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();await pool.end();}
