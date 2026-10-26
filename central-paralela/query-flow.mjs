import {createHash} from 'node:crypto';
import {savedChipStatus} from './chip-status.mjs';

// Same isolation as the original credential guard; durable hashes, never secrets.
export function guardQueries(service,storage){
 for(const method of ['api','carrier']){
  const original=service[method].bind(service);
  service[method]=async(first,...args)=>{
   const secrets=service.secrets(),credentials=method==='api'?service.credentials(first,true):first==='arya'?[secrets.arya_email,secrets.arya_password]:[secrets.linksolutions_email,secrets.linksolutions_password];
   const key='queryGuard:'+method+':'+first;
   const fingerprint=createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
   const state=await storage.get(key);
   if(state?.fingerprint===fingerprint){
    if(state.blocked)throw Object.assign(Error('Credencial recusada. Corrija o acesso desta integração para retomar.'),{credentialInvalid:true,status:503});
    if(state.until>Date.now())throw Object.assign(Error('Integração aguardando liberação do limite de consultas.'),{status:429});
   }
   try{return await original(first,...args);}catch(e){
    if(e.credentialInvalid||(method==='carrier'&&e.upstreamStatus===403))await storage.put(key,{fingerprint,blocked:true});
    else if(e.status===429)await storage.put(key,{fingerprint,until:Date.now()+60000});
    throw e;
   }
  };
 }
 return service;
}

export async function queryStatus(service,branch,row){
 const capture=async fn=>{try{return await fn();}catch(e){return{ok:false,message:e.message};}};
 // Reuse only codes confirmed for this exact branch/serial. Missing contacts are
 // refreshed once; established page monitoring never probes both carriers.
 let equipment;
 const codes=row.api_codes?.branch===branch&&row.api_codes?.serial===row.serial?row.api_codes:null;
 if(!codes||!row.iccid||!row.apn)equipment=await capture(()=>service.equipment(branch,row.serial));
 const exact=equipment?.ok&&equipment.serial===row.serial;
 const nextCodes=exact&&/^[1-9]\d*$/.test(equipment.vehicle_id||'')?{branch,serial:row.serial,vehicle_id:equipment.vehicle_id,equipment_id:equipment.id}:null;
 const contacts=exact?{iccid:equipment.iccid,apn:equipment.apn}:row;
 const [location,chip]=await Promise.all([
  equipment&&!exact&&!codes?Promise.resolve({ok:false,message:equipment.message||'Cadastro não confirmado.'}):capture(()=>service.equipmentLocation(branch,row.serial,nextCodes||codes||(exact?equipment:null))),
  savedChipStatus(service,contacts)
 ]);
 if(nextCodes)row.api_codes=nextCodes;
 // A changed remote binding must be re-resolved on the next round.
 if(!location.ok)delete row.api_codes;
 if(exact)for(const key of ['iccid','apn','phone','carrier'])if(equipment[key])row[key]=equipment[key];
 return{location,chip,queried_at:new Date().toISOString()};
}

const timestamp=value=>{const s=String(value||'').trim().replace(' ','T');return Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(s)?s+'-03:00':s);};
export function latestLocation(previous,next){
 if(previous?.serial&&next?.serial&&previous.serial!==next.serial)return next;
 if(!next?.ok)return previous?.ok?{...previous,query_error:next?.message||'Consulta pendente'}:next;
 const before=timestamp(previous?.updated_at),after=timestamp(next.updated_at),oldGps=timestamp(previous?.gps_at),newGps=timestamp(next.gps_at);
 if(previous?.ok&&((Number.isFinite(before)&&(!Number.isFinite(after)||after<before))||(Number.isFinite(oldGps)&&Number.isFinite(newGps)&&newGps<oldGps)))return previous;
 return{...next,query_error:''};
}
