import {randomUUID} from 'node:crypto';
import {guardedIntegrations} from './background-sync.mjs';
import {trackQueries} from './query-usage.mjs';
import {ignitionState} from '../public/maintenance-ignition.js';
const key=v=>String(v||'').replace(/[\s-]/g,'').toUpperCase();
export function confirmedIgnition(row,result){
 if(!result?.ok||result.serial!==row.serial||!key(row.plate)||key(result.plate)!==key(row.plate))throw Error('Ignição não confirmou o aparelho e a placa da manutenção.');
 const state=ignitionState(result.ignition);
 if(state==='unknown')throw Error('Ignição não informada pela plataforma.');
 return{ignition:state,communication_at:result.updated_at||null,warning:''};
}
export async function maintenanceSnapshot(pool,service,branch,force=false){
 const read=async(data=null,warning=null)=>(await pool.query('select central_homologacao.maintenance_snapshot($1,$2,$3) as data',[branch,data,warning])).rows[0].data;
 const previous=await read();
 if(previous&&!force)return previous;
 try{return await read(await service.maintenance(branch));}
 catch(e){const saved=await read(null,e.message);if(saved)return saved;throw e;}
}
export function maintenanceTick(pool,options={}){return trackQueries(pool,'automatic',()=>run(pool,options));}
async function run(pool,{service,budgetMs=40000,now=Date.now}={}){
 const lease=randomUUID(),batch=(await pool.query('select central_homologacao.maintenance_claim($1) as data',[lease])).rows[0].data;
 if(!batch.rows)return{processed:0};
 const start=now();let processed=0;service??=guardedIntegrations(pool);
 try{
  if(batch.branch)try{await maintenanceSnapshot(pool,service,batch.branch,true);}catch{}
  // Two workers, eight vehicles per tick. Existing API rate limits still apply.
  let cursor=0;await Promise.all(Array.from({length:2},async()=>{while(cursor<batch.rows.length&&now()-start<budgetMs){
   const row=batch.rows[cursor++];let result;
   try{result=confirmedIgnition(row,await service.stockCommunication(row.branch,row.serial));}
   catch(e){result={ignition:null,warning:e.message};}
   await pool.query('select central_homologacao.maintenance_save($1,$2,$3,$4,$5,$6)',[lease,row.branch,row.serial,row.plate,row.baseline,result]);processed++;
  }}));return{processed};
 }finally{await pool.query('select central_homologacao.maintenance_release($1)',[lease]);}
}
