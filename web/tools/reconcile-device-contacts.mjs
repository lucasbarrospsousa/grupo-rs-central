// Fresh, exact-series reads; private backups; additive contact repair only.
import {writeFileSync,readFileSync} from 'node:fs';
import {createPool,privatePath} from '../backend/database.mjs';
import {guardedIntegrations} from '../backend/background-sync.mjs';
const pool=createPool({admin:true}),apply=process.argv.includes('--apply');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),results=[];
try{
 const snapshot={};
 for(const table of ['devices','warehouse_items','warehouse_movements'])snapshot[table]=(await pool.query('select * from central_homologacao.'+table)).rows;
 writeFileSync(privatePath('contacts-before-'+stamp+'.json'),JSON.stringify(snapshot),{flag:'wx'});
 if(apply&&!(await pool.query('select 1 from central_homologacao.migrations where version=11')).rowCount)await pool.query(readFileSync(new URL('../migrations/011_device_contacts.sql',import.meta.url),'utf8'));
 const rows=(await pool.query(`select d.id,d.branch_id,d.serial from central_homologacao.devices d left join central_homologacao.device_observations o on o.device_id=d.id where d.deleted_at is null and
 (btrim(coalesce(d.data->>'iccid','')) in ('','—','-') or regexp_replace(coalesce(d.data->>'phone',''),'[^0-9]','','g') !~ '^[0-9]{10,13}$' or exists(select 1 from central_homologacao.warehouse_items w where w.kind='chip' and w.deleted_at is null and w.status='Disponível' and w.serial in (d.data->>'iccid',o.data->'equipment'->>'iccid'))) order by d.branch_id,d.serial`)).rows;
 const service=guardedIntegrations(pool);let cursor=0,done=0;
 await Promise.all(Array.from({length:2},async()=>{while(cursor<rows.length){const row=rows[cursor++];try{
  const remote=(await service.stockDetails(row.branch_id,row.serial)).equipment;
  if(remote.serial!==row.serial)throw Error('Série não confirmada');
  const result=apply?(await pool.query('select central_homologacao.apply_device_contacts($1,$2,now()) result',[row.id,remote])).rows[0].result:{confirmed:true};
  results.push({...row,result});
 }catch(e){results.push({...row,error:e.message});}
 if(++done%25===0)console.log(JSON.stringify({processed:done,total:rows.length}));
 }}));
 writeFileSync(privatePath('contacts-result-'+stamp+'.json'),JSON.stringify({apply,results}),{flag:'wx'});
 const summary={apply,queried:rows.length,confirmed:results.filter(r=>r.result?.confirmed).length,failed:results.filter(r=>r.error).length,filledIccid:results.filter(r=>r.result?.filled?.iccid).length,filledPhone:results.filter(r=>r.result?.filled?.phone).length,movements:results.filter(r=>r.result?.movementId).length};
 summary.remaining=(await pool.query(`select branch_id,count(*) filter(where btrim(coalesce(data->>'iccid','')) in ('','—','-'))::int missing_iccid,count(*) filter(where btrim(coalesce(data->>'phone','')) in ('','—','-'))::int missing_phone from central_homologacao.devices where deleted_at is null group by branch_id order by branch_id`)).rows;
 console.log(JSON.stringify(summary));
}finally{await pool.end();}
