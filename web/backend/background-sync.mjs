import {integrationSessions} from './integration-sessions.mjs';
import {savedChipStatus} from './chip-status.mjs';
import {codeResult} from './code-scan.mjs';
import {setApiBudgetPool} from './api-budget.mjs';
import {trackQueries,queryContext} from './query-usage.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {Integrations} from './integrations.mjs';
import {sourceIntegrations} from './read-sources.mjs';
export function guardedIntegrations(pool,service=new Integrations({sessionStore:integrationSessions(pool)}),{captureCodes=true,apiOnly=false}={}){
 setApiBudgetPool(pool);
 const blocked=new Set(),checked=new Map();
 const guard=async(key,credentials,fn)=>{
  const fingerprint=createHash('sha256').update(JSON.stringify(credentials)).digest('hex'),guardKey=key+':'+fingerprint;
  if(!checked.has(guardKey))checked.set(guardKey,pool.query('select central_homologacao.sync_auth_state($1,$2) as blocked',[key,fingerprint]));
  if(blocked.has(guardKey)||(await checked.get(guardKey)).rows[0].blocked)throw Object.assign(Error('Credencial inválida: integração pausada até corrigir o acesso.'),{credentialInvalid:true});
  try{return await fn();}catch(e){if(e.automaticDeferred&&queryContext().mode==='page')return fn();if(e.credentialInvalid||e.upstreamStatus===401||(key.startsWith('carrier:')&&e.upstreamStatus===403)){blocked.add(guardKey);await pool.query('select central_homologacao.sync_auth_state($1,$2,$3)',[key,fingerprint,e.credentialInvalid?'Credencial rejeitada. Atualize o acesso desta integração para retomar.':'Acesso recusado após renovar a sessão. Integração pausada; confira a permissão da plataforma.']);}throw e;}
 };
 for(const method of ['api','apiPost','carrier']){if(typeof service[method]!=='function')continue;const original=service[method].bind(service);service[method]=async(first,...args)=>{const credentials=method==='carrier'?(()=>{const s=service.secrets();return first==='arya'?[s.arya_email,s.arya_password]:[s.linksolutions_email,s.linksolutions_password];})():service.credentials(first,method==='api'||method==='apiPost');return guard((method==='apiPost'?'api':method)+':'+first,credentials,()=>original(first,...args));};}
 if(captureCodes&&typeof service.equipment==='function'){const equipment=service.equipment.bind(service);service.equipment=async(branch,serial)=>{const result=await equipment(branch,serial);if(branch==='imperatriz')try{await pool.query('select central_homologacao.capture_device_codes($1,$2)',[serial,codeResult({serial,plate:result.plate},result)]);}catch{ /* Capture failure never prevents the original consultation. */ }return result;};}
 if(typeof service.equipmentLocation==='function'){const location=service.equipmentLocation.bind(service);service.equipmentLocation=async(branch,serial)=>{const codes=branch==='imperatriz'?(await pool.query('select central_homologacao.location_device_codes($1,$2) as codes',[branch,serial])).rows[0]?.codes:null;return location(branch,serial,codes);};}
 service.savedEquipmentCode=async(branch,serial)=>(await pool.query('select central_homologacao.binding_device_code($1,$2) as code',[branch,serial])).rows[0]?.code||null;
 if(apiOnly)return service;
 return sourceIntegrations(service,async branch=>{const r=await pool.query('select mode from central_homologacao.read_sources where branch_id=$1',[branch]);if(!r.rows.length)throw Error('Fonte de consulta não configurada para esta base.');return r.rows[0].mode;});
}
export function syncTick(pool,options={}){return trackQueries(pool,'automatic',()=>runTick(pool,options),'stock');}
async function runTick(pool,{service,budgetMs=45000,now=Date.now}={}){
 const lease=randomUUID(),batch=(await pool.query('select central_homologacao.sync_claim($1) as batch',[lease])).rows[0].batch;
 if(!batch.rows.length)return{processed:0,complete:!!batch.complete};
 service=service||guardedIntegrations(pool);let processed=0,cursor=0,stopped=false;const start=now();
 try{
  await Promise.all(Array.from({length:1},async()=>{while(!stopped&&cursor<batch.rows.length&&now()-start<budgetMs){const row=batch.rows[cursor++];let result;try{result=await monitorStock(service,row);}catch(e){if(e.automaticDeferred){stopped=true;break;}result={serial:row.serial,equipment:{ok:false,message:e.message},location:{ok:false,message:e.message},chip:{ok:false,message:e.message}};}await pool.query('select central_homologacao.sync_save($1,$2,$3,$4)',[lease,batch.cycle,row.id,result]);processed++;}}));return{processed,cycle:batch.cycle};}
 finally{await pool.query('select central_homologacao.sync_release($1)',[lease]);}
}

// Read only telemetry and SIM status; no owner, history or consumption queries.
export async function monitorStock(service,row){
 const capture=async fn=>{try{return await fn();}catch(e){if(e.automaticDeferred)throw e;return{ok:false,message:e.message};}};
 const at=new Date().toISOString();
 const raw=await capture(()=>service.stockCommunication(row.branch,row.serial));
 const location=Object.fromEntries(['ok','message','updated_at','gps_at','ignition','data_source'].filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));
 let chip=row.chip||{ok:false,message:'Chip ainda não consultado.'},chip_checked_at=row.chip_checked_at||null;
 if(row.chip_due){
  chip_checked_at=at;
  const found=await savedChipStatus(service,row);
  chip=Object.fromEntries(['ok','message','iccid','status','connectivity','provider'].filter(k=>found[k]!==undefined).map(k=>[k,found[k]]));
 }
 return{location,chip,chip_checked_at,monitor_iccid:row.iccid||'',monitor_apn:row.apn||'',queried_at:at};
}
