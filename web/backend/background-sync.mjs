import {randomUUID,createHash} from 'node:crypto';
import {Integrations} from './integrations.mjs';
export function guardedIntegrations(pool,service=new Integrations()){
 const blocked=new Set(),checked=new Map();
 const guard=async(key,credentials,fn)=>{
  const fingerprint=createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
  if(!checked.has(key))checked.set(key,pool.query('select central_homologacao.sync_auth_state($1,$2) as blocked',[key,fingerprint]));
  if(blocked.has(key)||(await checked.get(key)).rows[0].blocked)throw Object.assign(Error('Credencial inválida: integração pausada até corrigir o acesso.'),{credentialInvalid:true});
  try{return await fn();}catch(e){if(e.credentialInvalid||[401,403].includes(e.upstreamStatus)){blocked.add(key);await pool.query('select central_homologacao.sync_auth_state($1,$2,$3)',[key,fingerprint,e.credentialInvalid?'Credencial rejeitada. Atualize o acesso desta integração para retomar.':'Acesso recusado após renovar a sessão. Integração pausada; confira a permissão da plataforma.']);}throw e;}
 };
 for(const method of ['api','portal','carrier']){const original=service[method].bind(service);service[method]=async(first,...args)=>{const credentials=method==='carrier'?(()=>{const s=service.secrets();return first==='arya'?[s.arya_email,s.arya_password]:[s.linksolutions_email,s.linksolutions_password];})():service.credentials(first,method==='api');return guard(method+':'+first,credentials,()=>original(first,...args));};}
 return service;
}
export async function syncTick(pool,{service,budgetMs=45000,now=Date.now}={}){
 const lease=randomUUID(),batch=(await pool.query('select central_homologacao.sync_claim($1) as batch',[lease])).rows[0].batch;
 if(!batch.rows.length)return{processed:0,complete:!!batch.complete};
 service=service||guardedIntegrations(pool);let processed=0,cursor=0;const start=now();
 try{
  if(service.maintenance)for(const branch of [...new Set(batch.rows.map(r=>r.branch))]){
   const prior=(await pool.query('select central_homologacao.sync_panorama($1) as snapshot',[branch])).rows[0].snapshot;
   if(prior?.cycle===batch.cycle)continue;
   let data;try{data=await service.maintenance(branch);}catch(e){data={ok:false,message:e.message};}
   await pool.query('select central_homologacao.sync_panorama($1,$2,$3)',[branch,batch.cycle,data]);
  }
  await Promise.all(Array.from({length:3},async()=>{while(cursor<batch.rows.length&&now()-start<budgetMs){const row=batch.rows[cursor++];let result;try{result=await service.stockDetails(row.branch,row.serial);}catch(e){result={serial:row.serial,equipment:{ok:false,message:e.message},location:{ok:false,message:e.message},chip:{ok:false,message:e.message}};}await pool.query('select central_homologacao.sync_save($1,$2,$3,$4)',[lease,batch.cycle,row.id,result]);processed++;}}));return{processed,cycle:batch.cycle};}
 finally{await pool.query('select central_homologacao.sync_release($1)',[lease]);}
}
