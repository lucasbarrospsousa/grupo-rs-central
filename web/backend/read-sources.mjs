import {PortalRead} from './portal-read.mjs';
import {ORIGINS} from './integrations.mjs';
const fail=message=>Object.assign(Error(message),{status:422});
const empty=v=>v===undefined||v===null||String(v).trim()===''||['—','-','Não informado'].includes(v);
const key=v=>String(v||'').replace(/[\s-]/g,'').toUpperCase();
export function mergeConfirmed(api,web){
 for(const field of ['serial','vehicle_id','plate','client_id','client','id'])if(!empty(api[field])&&!empty(web[field])&&(field==='plate'?key(api[field])!==key(web[field]):String(api[field]).trim()!==String(web[field]).trim()))throw fail('API e web divergem em '+field+'. Confira o vínculo; dados preservados.');
 if(Number(api.owner_count)>1)throw fail('A API informa múltiplos titulares. Conferência manual necessária.');
 const out={...api,field_sources:{...api.field_sources}},samePosition=api.updated_at&&Date.parse(api.updated_at)===Date.parse(web.updated_at)&&Date.parse(api.gps_at)===Date.parse(web.gps_at);
 const telemetry=new Set(['lat','lng','battery','ignition','speed','gps_at','gps_signal','updated_at']);
 for(const [field,v] of Object.entries(web))if(!['source','data_source','queried_at','ok','field_sources'].includes(field)&&empty(out[field])&&!empty(v)&&(!telemetry.has(field)||samePosition)){out[field]=v;out.field_sources[field]='web';}
 return{...out,data_source:'both',queried_at:new Date().toISOString()};
}
export function classifyBinding(row,serial){
 if(!row)return{ok:false,category:'review',serial,message:'Nenhum vínculo exato retornado.'};
 if(!row.client||Number(row.owner_count)>1)return{...row,ok:false,category:'review',message:'Titular não confirmado. Confira antes da baixa.'};
 const plate=key(row.plate),internal=/^(AAA|GRS|XRS|NOV)/.test(plate),stock=row.client.toUpperCase()==='RS300'&&(internal||!/^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(plate)),ok=!stock&&!internal&&/^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(plate)&&row.client.toUpperCase()!=='RS300';
 return{...row,ok,category:stock?'stock':ok?'eligible':'review',message:stock?'Permanece em estoque':ok?'Vínculo confirmado':'Conferir vínculo'};
}
export function sourceIntegrations(api,getMode,web=new PortalRead(api)){
 const methods={equipment:'equipment',equipmentPortal:'equipment',vehicles:'vehicles',location:'location',equipmentLocation:'location',maintenance:'maintenance',clients:'clients',clientVehicles:'clientVehicles',history:'history'};
 async function read(method,branch,args,mode){
  if(!ORIGINS[branch])throw fail('Base inválida.');
  if(mode==='web')return web[methods[method]](branch,...args);
  if(mode==='api')return api[method](branch,...args);
  let a;try{a=await api[method](branch,...args);}catch(e){if(e.status===400||e.status===429||/diverg|amb[ií]gu|m[úu]ltipl|mudou|outro ve[ií]culo|não confirmou a série/i.test(e.message))throw e;return web[methods[method]](branch,...args);}
  const needs=Array.isArray(a)?!a.length||a.some(x=>empty(x.client)&&!x.name):method==='maintenance'||a?.ok===false||['equipment','equipmentPortal'].includes(method)&&['iccid','phone','apn','carrier','client'].some(k=>empty(a?.[k]))||['location','equipmentLocation'].includes(method)&&['client','battery','ignition','gps_signal'].some(k=>empty(a?.[k]));
  if(!needs)return a;
  let w;try{w=await web[methods[method]](branch,...args);}catch(e){if(Array.isArray(a))throw fail('Complemento web não confirmado: '+e.message);return{...a,source_warning:'Complemento web não confirmado: '+e.message};}
  if(Array.isArray(a)){if(!a.length)return w;return a.map(row=>{const matches=w.filter(x=>row.serial?x.serial===row.serial:x.id===row.id);if(matches.length!==1)throw fail('Correspondência única entre API e web não confirmada.');return mergeConfirmed(row,matches[0]);});}
  if(a?.ok===false)return w;
  return mergeConfirmed(a,w);
 }
 const facade=new Proxy(api,{get(target,method){
  // The visible list needs telemetry, not the slower identity enrichment.
  if(method==='stockCommunication')return async(branch,serial)=>{
   if(!ORIGINS[branch])throw fail('Base inválida.');
   return await getMode(branch)==='web'?web.location(branch,serial):api.equipmentLocation(branch,serial);
  };
  if(method==='locationIdentity')return async(branch,serial)=>{
   if(!ORIGINS[branch])throw fail('Base inválida.');
   if(await getMode(branch)==='api')return{ok:true,skipped:true,message:'Complemento web desativado: somente API.'};
   const rows=await web.vehicles(branch,serial);
   if(rows.length!==1||rows[0].serial!==serial||!rows[0].client||!/^\d+$/.test(rows[0].vehicle_id))throw fail('Titular e vínculo únicos não confirmados na web.');
   const {client,plate,vehicle_id}=rows[0];
   return{ok:true,serial,client,plate,vehicle_id,data_source:'web',queried_at:new Date().toISOString()};
  };
  if(method==='binding')return async(branch,serial,hint,options)=>{const mode=await getMode(branch);if(mode==='api')return api.binding(branch,serial,hint,options);const found=await read('vehicles',branch,[serial],mode);if(found.length>1)throw fail('Mais de um vínculo exato.');return classifyBinding(found[0],serial);};
  if(method==='stockDetails')return async(branch,serial,plate)=>{const capture=async fn=>{try{return await fn();}catch(e){return{ok:false,message:e.message}}};const [equipment,location]=await Promise.all([capture(()=>facade.equipmentPortal(branch,serial)),capture(()=>facade.location(branch,serial,plate))]);let chip={ok:false,message:'ICCID não confirmado.'};if(/^89\d{17,18}$/.test(equipment.iccid||'')){chip=await capture(()=>api.carrier('arya',equipment.iccid));if(!chip.ok)chip=await capture(()=>api.carrier('link',equipment.iccid));}return{serial,equipment,location,chip,source:ORIGINS[branch],queried_at:new Date().toISOString()};};
  if(method in methods)return async(branch,...args)=>read(method,branch,args,await getMode(branch));
  const value=target[method];return typeof value==='function'?value.bind(target):value;
 }});return facade;
}
export async function readSourceSettings(pool){return(await pool.query('select branch_id,mode from central_homologacao.read_sources order by branch_id')).rows;}
export async function saveSourceSettings(pool,body){
 if(!Array.isArray(body.branches)||body.branches.length!==4||new Set(body.branches.map(x=>x.branch_id)).size!==4||body.branches.some(x=>!ORIGINS[x.branch_id]||!['api','web','both'].includes(x.mode)))throw Object.assign(Error('Informe uma fonte válida para cada base.'),{status:400});
 await pool.query('update central_homologacao.read_sources s set mode=x.mode,updated_at=now() from jsonb_to_recordset($1::jsonb) x(branch_id text,mode text) where s.branch_id=x.branch_id',[JSON.stringify(body.branches)]);return readSourceSettings(pool);
}
