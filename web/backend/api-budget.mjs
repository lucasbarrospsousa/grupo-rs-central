import {randomUUID} from 'node:crypto';
import {queryContext} from './query-usage.mjs';
let pool;
export function setApiBudgetPool(value){pool=value;}
export const deferredQuery=reason=>Object.assign(Error('Consulta automática aguardando espaço.'),{automaticDeferred:true,reason});
export async function withApiBudget(branch,run){
 if(!pool)throw Object.assign(Error('Controle de consultas da API indisponível.'),{status:503});
 const database=pool,lease=randomUUID(),deadline=Date.now()+12000,{mode,routine}=queryContext();
 try{
  while(true){
   const {wait_ms:wait,reason}=(await database.query('select central_homologacao.query_claim($1,$2,$3,$4) as data',[branch,lease,mode,routine])).rows[0].data;
   if(wait===0)break;
   if(mode==='automatic'&&(['manual','paused','capacity'].includes(reason)||Date.now()+wait>deadline))throw deferredQuery(reason);
   if(Date.now()+wait>deadline)throw Object.assign(Error('Fila de consultas ocupada. Aguarde alguns segundos.'),{status:429,reason:'queue_busy'});
   await new Promise(resolve=>setTimeout(resolve,Math.min(wait,1000)));
  }
  return await run();
 }finally{await database.query('select central_homologacao.api_v2_release($1,$2)',[branch,lease]);}
}
export function queryPolicyInput(body){
 const {priority,automatic_limit,resume_seconds,gap_seconds,stock,codes,maintenance}=body;
 if([priority,stock,codes,maintenance].some(v=>typeof v!=='boolean')||![1,2].includes(automatic_limit)||[resume_seconds,gap_seconds].some(v=>!Number.isInteger(v)||v<0||v>60))throw Object.assign(Error('Informe limite de 1 ou 2, tempos de 0 a 60 segundos e o estado de cada rotina.'),{status:400});
 return{priority,automatic_limit,resume_seconds,gap_seconds,stock,codes,maintenance};
}
