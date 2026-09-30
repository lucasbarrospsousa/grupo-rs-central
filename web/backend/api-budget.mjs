import {randomUUID} from 'node:crypto';
let pool;
export function setApiBudgetPool(value){pool=value;}
export async function withApiBudget(branch,run){
 if(!pool)throw Object.assign(Error('Controle de consultas da API indisponível.'),{status:503});
 const lease=randomUUID(),deadline=Date.now()+12000;
 while(true){
  const {wait_ms:wait}= (await pool.query('select central_homologacao.api_v2_claim($1,$2) as wait_ms',[branch,lease])).rows[0];
  if(wait===0)break;
  if(Date.now()+wait>deadline)throw Object.assign(Error('Limite de consultas em uso. Aguarde alguns segundos e consulte novamente.'),{status:429});
  await new Promise(resolve=>setTimeout(resolve,wait));
 }
 try{return await run();}finally{await pool.query('select central_homologacao.api_v2_release($1,$2)',[branch,lease]);}
}
