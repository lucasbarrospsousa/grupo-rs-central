import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createPool, privatePath } from '../backend/database.mjs';
const map={imperatriz:['imperatriz','Imperatriz'],backups_araguaina:['araguaina','Araguaína'],backups_acailandia:['acailandia','Açailândia'],backups_maraba:['maraba','Marabá']};
const file=privatePath('snapshot-20260924.sqlite');
const digest=createHash('sha256').update(readFileSync(file)).digest('hex');
const inventory=JSON.parse(readFileSync(privatePath('inventory.json'),'utf8'));
if(digest!==inventory.sha256) throw Error('Snapshot hash differs from verified baseline');
const source=new DatabaseSync(file,{readOnly:true});
if(source.prepare('pragma integrity_check').get().integrity_check!=='ok')throw Error('SQLite integrity failed');
const deviceRows=source.prepare('select * from devices').all();
const selected=[]; const seen=new Set(); const excluded={};
for(const row of deviceRows){
  if(!map[row.branch_id]){excluded[row.branch_id]=(excluded[row.branch_id]||0)+1;continue;}
  const raw=JSON.parse(row.raw_json||'{}');
  const serial=[row.imei,raw.equipment_number,raw.imei,row.sku].find(v=>typeof v==='string'&&/^\d{6,17}$/.test(v));
  const branch=map[row.branch_id][0]; const key=branch+':'+serial;
  if(!serial||seen.has(key))throw Error('Invalid/duplicate canonical serial; import stopped');
  seen.add(key);
  const data={serial,branch,identification:raw.identification_plate||'',plate:raw.vehicle_plate||row.plate||'',
    client:raw.client||'',carrier:row.carrier||raw.operator||'',model:row.model||'',status:row.status,
    iccid:row.iccid||raw.chip_number||'',phone:raw.chip_phone||'',apn:raw.apn||'',
    installed_at:raw.installed_at||'',created_at:row.created_at||'',updated_at:row.updated_at||'',
    communication:'Não consultado',connectivity:'Não consultado'};
  selected.push({id:randomUUID(),branch,sourceId:row.id,serial,data});
}
const pool=createPool({admin:true}); const client=await pool.connect();
try{
  await client.query('BEGIN'); await client.query("select pg_advisory_xact_lock(hashtext('central_homologacao_import'))");
  if((await client.query('select 1 from central_homologacao.imports where source_hash=$1',[digest])).rowCount){
    await client.query('ROLLBACK');console.log('Baseline already imported; no changes.');
  }else{
    if((await client.query('select count(*)::int as n from central_homologacao.devices')).rows[0].n)throw Error('Target not empty; refusing overwrite');
    const id=randomUUID(), counts={devices:selected.length,branches:4,maintenance:0,movements:0,excluded};
    for(const [branch,name] of Object.values(map))await client.query('insert into central_homologacao.branches values($1,$2)',[branch,name]);
    await client.query('insert into central_homologacao.imports(id,source_hash,counts) values($1,$2,$3)',[id,digest,counts]);
    for(let i=0;i<selected.length;i+=250){
      await client.query(`insert into central_homologacao.devices(id,branch_id,source_id,serial,data)
        select x.id::uuid,x.branch,x."sourceId",x.serial,x.data from jsonb_to_recordset($1::jsonb)
        as x(id text,branch text,"sourceId" text,serial text,data jsonb)`,[JSON.stringify(selected.slice(i,i+250))]);
    }
    for(const table of ['maintenance','movements']){
      const rows=source.prepare(`select * from ${table}`).all().filter(r=>map[r.branch_id]);
      // Operational history only: no audit payloads, auth, runtime monitors or telemetry.
      for(const row of rows)await client.query('insert into central_homologacao.legacy_records values($1,$2,$3,$4,$5)',[id,table,row.id,map[row.branch_id][0],JSON.parse(row.raw_json||'{}')]);
      counts[table]=rows.length;
    }
    await client.query('update central_homologacao.imports set counts=$2 where id=$1',[id,counts]);
    const verify=(await client.query('select branch_id,count(*)::int as count from central_homologacao.devices group by branch_id order by branch_id')).rows;
    if(verify.reduce((n,r)=>n+r.count,0)!==selected.length)throw Error('Count mismatch; rolling back');
    await client.query('COMMIT');
    writeFileSync(privatePath('import-result.json'),JSON.stringify({id,digest,counts,verify,at:new Date().toISOString()},null,2));
    console.log(JSON.stringify({counts,verify}));
  }
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end();source.close();}
