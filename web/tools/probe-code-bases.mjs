// Explicit, bounded read-only upstream test. No serials, IDs or credentials in output.
import {createPool} from '../backend/database.mjs';
import {guardedIntegrations} from '../backend/background-sync.mjs';
import {trackQueries} from '../backend/query-usage.mjs';
const pool=createPool({admin:true}),branches=['imperatriz','araguaina','acailandia','maraba'];
const service=guardedIntegrations(pool,undefined,{captureCodes:false,apiOnly:true});
try{
 const sample=await Promise.all(branches.map(async branch=>({branch,rows:(await pool.query("select d.serial from central_homologacao.devices d left join central_homologacao.device_codes c on c.device_id=d.id where d.branch_id=$1 and d.deleted_at is null and d.serial ~ '^[0-9]{6,17}$' order by (c.equipment_id is not null) desc,d.serial limit 10",[branch])).rows})));
 const start=Date.now();
 const results=await Promise.all(sample.map(({branch,rows})=>trackQueries(pool,'page',async()=>{
  const at=Date.now(),times=[],errors={};let confirmed=0,apn=0,vehicle=0;
  for(const row of rows){const t=Date.now();try{const r=await service.equipment(branch,row.serial);if(r.ok&&r.serial===row.serial){confirmed++;apn+=!!r.apn;vehicle+=!!r.vehicle_id;}}
   catch(e){const key=e.credentialInvalid?'authentication':e.upstreamStatus||e.status||'query';errors[key]=(errors[key]||0)+1;if(e.credentialInvalid||[401,403,429].includes(e.upstreamStatus)||e.status===429)break;}finally{times.push(Date.now()-t);}}
  return {branch,attempted:times.length,confirmed,apn,vehicle,errors,elapsed_ms:Date.now()-at,mean_ms:Math.round(times.reduce((a,b)=>a+b,0)/Math.max(1,times.length))};
 })));
 console.log(JSON.stringify({parallel_bases:4,per_base_concurrency:1,elapsed_ms:Date.now()-start,results}));
}finally{await pool.end();}
