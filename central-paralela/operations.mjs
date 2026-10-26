import {Integrations,ORIGINS} from './integrations.mjs';
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
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.busy=false;this.service=new Integrations({secrets:()=>JSON.parse(env.INTEGRATIONS_CONFIG||'null')||{}});}
 async fetch(request){
  if(this.busy)return reply(429,{error:'Há uma consulta em andamento. Aguarde.'});
  this.busy=true;
  try{
   const b=await request.json();
   if(!Object.hasOwn(ORIGINS,b.branch)||!/^\d{6,17}$/.test(b.serial||'')||!['status','history'].includes(b.kind))return reply(400,{error:'Consulta inválida.'});
   const last=await this.ctx.storage.get('lastQuery')||0;
   if(Date.now()-last<10000)return reply(429,{error:'Aguarde dez segundos entre consultas.'});
   const doc=await trackingDocument(JSON.parse(this.env.DRIVE_CONFIG||'null'),b.branch);
   const rows=doc.data.rows.filter(r=>r.serial===b.serial);if(rows.length!==1)return reply(404,{error:'Aparelho único não encontrado na cópia desta filial.'});
   const row=rows[0];
   if(b.kind==='status'&&row.live&&Date.now()-Date.parse(row.live.queried_at)<30000)return reply(200,{serial:b.serial,branch:b.branch,live:row.live,cached:true,saved:true});
   await this.ctx.storage.put('lastQuery',Date.now());
   if(b.kind==='history'){
    const result=await this.service.history(b.branch,b.serial,b.start,b.end);
    return reply(200,{serial:b.serial,branch:b.branch,partial:result.partial,rows:result.rows,queried_at:new Date().toISOString()});
   }
   const result=await this.service.stockDetails(b.branch,b.serial,row.plate||row.identification||'');
   const live=observation(result);
   // Preserve the last confirmed chip state/date on failure; live contains the new error.
   row.live=live;
   if(live.chip.ok){row.connectivity=live.chip.connectivity;row.checked_at=live.chip.queried_at;}
   await doc.save();
   return reply(200,{serial:b.serial,branch:b.branch,live,saved:true});
  }catch(e){return reply([400,422,429].includes(e.status)?e.status:503,{error:e.status?text(e.message):'Consulta ou gravação no Drive indisponível. Nenhuma alteração foi enviada ao fornecedor.'});}
  finally{this.busy=false;}
 }
}
