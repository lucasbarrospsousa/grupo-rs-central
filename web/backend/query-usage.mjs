import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage();
export function querySource(address){
 const u=new URL(address);
 if(u.hostname==='api-arya.hinovaconecta.com.br')return 'arya';
 if(u.hostname==='lsm.tnsi.com.br')return 'link';
 if(['imp','arg','acl','mab'].some(b=>u.hostname===b+'.ogrupors.com.br'))return u.pathname.startsWith('/api_rest_app')?'api':'portal';
 return 'other';
}
export async function measuredRequest(request,address,options){
 const counters=context.getStore();if(!counters)return request(address,options);
 const source=querySource(address);let ok=false;
 try{const result=await request(address,options);ok=true;return result;}
 finally{const row=counters.get(source)||{source,total:0,failed:0};row.total++;if(!ok)row.failed++;counters.set(source,row);}
}
export async function trackQueries(pool,mode,run){
 const counters=new Map();
 return context.run(counters,async()=>{try{return await run();}finally{
  if(counters.size)try{await pool.query('select central_homologacao.record_query_usage($1,$2::jsonb)',[mode,JSON.stringify([...counters.values()])]);}
  catch{console.warn('Contagem de consultas não persistida nesta execução.');}
 }});
}
export function automationInput(body){
 if(typeof body.enabled!=='boolean'||![5,10,30,1440].includes(body.interval_minutes))throw Object.assign(Error('Escolha 5, 10, 30 minutos ou 1 dia e informe o estado da automação.'),{status:400});
 return {enabled:body.enabled,interval_minutes:body.interval_minutes};
}
export async function automationStatus(pool){
 return (await pool.query('select central_homologacao.automation_status() as data')).rows[0].data;
}
