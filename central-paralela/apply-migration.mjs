import {readFile,readdir,writeFile} from 'node:fs/promises';
import {restoreBackup} from './backup-crypto.mjs';
import {signImport} from './maintenance-import.mjs';
import {digest} from './auth-crypto.mjs';
const root=new URL('../.secrets/homologacao/',import.meta.url),key=(await readFile(new URL('parallel-auth-key.txt',root),'utf8')).trim();
const dirs=(await readdir(new URL('parallel-migration/',root))).sort(),dir=new URL('parallel-migration/'+dirs.at(-1)+'/',root);
const source=await restoreBackup(JSON.parse(await readFile(new URL('source.enc.json',dir),'utf8')),key),t=source.tables;
const batches=[];
for(const branch of t.branches.map(b=>b.id)){
 const add=(section,records)=>{for(let i=0;i<records.length;i+=50)batches.push({action:'migration-apply',branch,section,records:records.slice(i,i+50)});};
 add('devices',t.devices.filter(r=>r.branch_id===branch&&!r.deleted_at).map(r=>({id:r.id,branch,original:r,value:{...r.data,id:r.id,serial:r.serial,version:r.version,created_at:r.created_at,updated_at:r.updated_at}})));
 add('warehouse',t.warehouse_items.filter(r=>r.branch_id===branch).map(r=>({id:r.id,branch,original:r,value:{...r,branch,chip_monitor_lease:null,chip_monitor_due:null,chip_status:r.chip_monitor_result?.status||'',checked_at:r.chip_monitor_result?.queried_at||null}})));
 add('movements',t.warehouse_movements.filter(r=>r.branch_id===branch).flatMap(r=>(r.items||[]).map((item,i)=>({id:r.id+':'+i,branch,original:{movement:r,item},value:{branch,serial:item.serial,kind:item.kind,type:item.action||'Envio',atISO:item.detected_at||r.created_at,destination:r.destination,note:r.note,deviceSerial:item.device_serial||''}}))));
 if(branch==='imperatriz'){
  const providers=(t.chip_cost_snapshots||[]).map(r=>({name:r.provider,total_cents:r.items.filter(i=>i.active&&Number.isSafeInteger(i.cents)).reduce((s,i)=>s+i.cents,0),active_count:r.items.filter(i=>i.active).length,checked_at:r.checked_at}));
  add('costs',[{id:'saved-provider-costs',branch,value:{providers,total_cents:providers.reduce((s,p)=>s+p.total_cents,0),active_count:providers.reduce((s,p)=>s+p.active_count,0),sourceAt:source.createdAt}}]);
 }
}
console.log(JSON.stringify({batches:batches.length,records:batches.reduce((s,b)=>s+b.records.length,0),providerCalls:0}));
if(!process.argv.includes('--apply'))process.exit(0);
async function call(input){const body=JSON.stringify(input);if(body.length>100000)throw Error('Batch too large');for(let n=0;n<10;n++){const r=await fetch('https://central-paralela.sinderacode.workers.dev/api/maintenance-import',{method:'POST',headers:{'content-type':'application/json','x-import-signature':signImport(body,key)},body,signal:AbortSignal.timeout(60000)});if(r.status===429){await new Promise(r=>setTimeout(r,2000));continue;}if(!r.ok)throw Error('Import HTTP '+r.status);return r.json();}throw Error('Writer unavailable');}
let done=0;for(const b of batches){const r=await call(b);for(const x of b.records)if(!r.receipts.some(y=>y.id===x.id&&y.hash===digest(JSON.stringify(x))))throw Error('Receipt mismatch');done++;if(done%25===0)console.log(JSON.stringify({completed:done,total:batches.length}));}
for(const branch of t.branches.map(b=>b.id)){const back=await call({action:'migration-verify',branch});for(const b of batches.filter(b=>b.branch===branch))for(const r of b.records)if(back.receipts[b.section+':'+r.id]!==digest(JSON.stringify(r)))throw Error('Verification mismatch');}
const report={at:new Date().toISOString(),batches:done,verified:true,sourceWrites:0,providerCalls:0};await writeFile(new URL('applied.json',dir),JSON.stringify(report),{mode:0o600});console.log(JSON.stringify(report));
