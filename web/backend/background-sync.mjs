import {setApiBudgetPool} from './api-budget.mjs';
import {trackQueries} from './query-usage.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {Integrations} from './integrations.mjs';
import {sourceIntegrations} from './read-sources.mjs';
export function guardedIntegrations(pool,service=new Integrations()){
 setApiBudgetPool(pool);
 const blocked=new Set(),checked=new Map();
 const guard=async(key,credentials,fn)=>{
  const fingerprint=createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
  if(!checked.has(key))checked.set(key,pool.query('select central_homologacao.sync_auth_state($1,$2) as blocked',[key,fingerprint]));
  if(blocked.has(key)||(await checked.get(key)).rows[0].blocked)throw Object.assign(Error('Credencial inválida: integração pausada até corrigir o acesso.'),{credentialInvalid:true});
  try{return await fn();}catch(e){if(e.credentialInvalid||e.upstreamStatus===401||(key.startsWith('carrier:')&&e.upstreamStatus===403)){blocked.add(key);await pool.query('select central_homologacao.sync_auth_state($1,$2,$3)',[key,fingerprint,e.credentialInvalid?'Credencial rejeitada. Atualize o acesso desta integração para retomar.':'Acesso recusado após renovar a sessão. Integração pausada; confira a permissão da plataforma.']);}throw e;}
 };
 for(const method of ['api','apiPost','carrier']){if(typeof service[method]!=='function')continue;const original=service[method].bind(service);service[method]=async(first,...args)=>{const credentials=method==='carrier'?(()=>{const s=service.secrets();return first==='arya'?[s.arya_email,s.arya_password]:[s.linksolutions_email,s.linksolutions_password];})():service.credentials(first,method==='api'||method==='apiPost');return guard((method==='apiPost'?'api':method)+':'+first,credentials,()=>original(first,...args));};}
 return sourceIntegrations(service,async branch=>{const r=await pool.query('select mode from central_homologacao.read_sources where branch_id=$1',[branch]);if(!r.rows.length)throw Error('Fonte de consulta não configurada para esta base.');return r.rows[0].mode;});
}
export function syncTick(pool,options={}){return trackQueries(pool,'automatic',()=>runTick(pool,options));}
async function runTick(pool,{service,budgetMs=45000,now=Date.now}={}){
 const lease=randomUUID(),batch=(await pool.query('select central_homologacao.sync_claim($1) as batch',[lease])).rows[0].batch;
 if(!batch.rows.length)return{processed:0,complete:!!batch.complete};
 service=service||guardedIntegrations(pool);let processed=0,cursor=0;const start=now();
 try{
  await Promise.all(Array.from({length:2},async()=>{while(cursor<batch.rows.length&&now()-start<budgetMs){const row=batch.rows[cursor++];let result;try{result=await service.stockDetails(row.branch,row.serial,row.plate);}catch(e){result={serial:row.serial,equipment:{ok:false,message:e.message},location:{ok:false,message:e.message},chip:{ok:false,message:e.message}};}await pool.query('select central_homologacao.sync_save($1,$2,$3,$4)',[lease,batch.cycle,row.id,result]);processed++;}}));return{processed,cycle:batch.cycle};}
 finally{await pool.query('select central_homologacao.sync_release($1)',[lease]);}
}
