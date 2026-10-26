import {guardQueries,queryStatus,latestLocation} from './query-flow.mjs';
import {Integrations,ORIGINS} from './integrations.mjs';
import {galaxy} from './galaxy.mjs';
import {inventory} from './inventory.mjs';
import {trackingDocument} from './drive.mjs';
const reply=(status,data)=>Response.json(data,{status});
const text=v=>typeof v==='string'?v.slice(0,300):typeof v==='number'?String(v):'';
const project=(row,keys)=>Object.fromEntries(keys.map(k=>[k,text(row?.[k])]));
export function observation(result){
 const location=result.location?.ok?{ok:true,...project(result.location,['serial','plate','lat','lng','speed','ignition','battery','internal_battery','internal_battery_voltage','updated_at','gps_at','gps_signal','queried_at'])}:{ok:false,message:text(result.location?.message)||'Comunicação indisponível.'};
 const chip=result.chip?.ok?{ok:true,...project(result.chip,['provider','status','connectivity','operator','queried_at'])}:{ok:false,message:text(result.chip?.message)||'Chip não confirmado.'};
 return {queried_at:result.queried_at,location,chip};
}
export class Operations {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.busy=false;this.service=guardQueries(new Integrations({secrets:()=>JSON.parse(env.INTEGRATIONS_CONFIG||'null')||{}}),ctx.storage);}
 async fetch(request){
  if(this.busy)return reply(429,{error:'Há uma consulta em andamento. Aguarde.'});
  this.busy=true;
  try{
   const b=await request.json();
   if(new URL(request.url).pathname==='/galaxy')return reply(200,await galaxy({input:b.input,token:b.token,config:JSON.parse(this.env.DRIVE_CONFIG||'null'),key:this.env.AUTH_DATA_KEY}));
   if(new URL(request.url).pathname==='/inventory'){
    const remote=['analyze','lookup','link-preview','link-confirm','link-check','refresh-equipment','sms-send'].includes(b.input?.action);
    if(remote){await this.ctx.storage.put('manualUntil',Date.now()+12000);const last=await this.ctx.storage.get('lastQuery')||0;if(Date.now()-last<10000)return reply(429,{error:'Aguarde dez segundos entre consultas.'});await this.ctx.storage.put('lastQuery',Date.now());}
    return reply(200,await inventory({input:b.input,user:b.user,config:JSON.parse(this.env.DRIVE_CONFIG||'null'),service:this.service}));
   }
   if(!Object.hasOwn(ORIGINS,b.branch)||!/^\d{6,17}$/.test(b.serial||'')||!['status','history'].includes(b.kind))return reply(400,{error:'Consulta inválida.'});
   const last=await this.ctx.storage.get('lastQuery')||0;
   const doc=await trackingDocument(JSON.parse(this.env.DRIVE_CONFIG||'null'),b.branch);
   const rows=doc.data.rows.filter(r=>!r.deleted_at&&r.serial===b.serial);if(rows.length!==1)return reply(404,{error:'Aparelho único não encontrado na cópia desta filial.'});
   const row=rows[0];
   if(b.kind==='status'&&row.live&&Date.now()-Date.parse(row.live.queried_at)<30000)return reply(200,{serial:b.serial,branch:b.branch,live:row.live,cached:true,saved:true});
   if(b.kind==='status'&&(await this.ctx.storage.get('manualUntil')||0)>Date.now())return reply(429,{error:'Consulta aguardando a operação manual.',retry_after_ms:1300});
   if(Date.now()-last<1300)return reply(429,{error:'Aguarde a consulta em andamento.',retry_after_ms:1300});
   await this.ctx.storage.put('lastQuery',Date.now());
   if(b.kind==='history'){
    const result=await this.service.history(b.branch,b.serial,b.start,b.end);
    return reply(200,{serial:b.serial,branch:b.branch,partial:result.partial,rows:result.rows,queried_at:new Date().toISOString()});
   }
   const result=await queryStatus(this.service,b.branch,row);
   const live=observation(result);
   // Preserve the last confirmed chip state/date on failure; live contains the new error.
   live.location=latestLocation(row.live?.location,live.location);row.live=live;
   if(live.chip.ok){row.connectivity=live.chip.connectivity;row.checked_at=live.chip.queried_at;}
   await doc.save();
   return reply(200,{serial:b.serial,branch:b.branch,live,saved:true});
  }catch(e){return reply([400,401,403,404,409,422,429].includes(e.status)?e.status:503,{error:e.status?text(e.message):'Não foi possível confirmar a conclusão. Confira o resultado antes de repetir a operação.'});}
  finally{this.busy=false;}
 }
}
