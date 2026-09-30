import {scoped} from './remote-actions.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function batchIds(input){const ids=Array.isArray(input)?input:[];if(!ids.length||ids.length>10||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!/^[a-f0-9-]{36}$/.test(x)))throw fail(400,'Informe até dez aparelhos distintos da página.');return ids;}
export async function mapTwo(items,fn){const result=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(2,items.length)},async()=>{while(cursor<items.length){const index=cursor++;try{result[index]={id:items[index].id,ok:true,...await fn(items[index])};}catch(e){result[index]={id:items[index].id,ok:false,message:e.message};}}}));return result;}
export function equipmentPatch(e,serial){if(!e.ok||e.serial!==serial)throw fail(422,'Série não confirmada.');const rawPhone=String(e.phone??'').trim(),phone=rawPhone.replace(/[\s().+\-]/g,'');if(!/^89\d{17,18}$/.test(e.iccid||'')||!/^\+?[\d\s().\-]+$/.test(rawPhone)||!/^\d{10,13}$/.test(phone)||!e.apn||!e.carrier)throw fail(422,'ICCID, telefone, operadora ou APN não confirmados. Cadastro preservado.');return{iccid:e.iccid,phone,apn:e.apn,carrier:e.carrier};}
export async function stockBatch({pool,user,branch,service,ids,kind}){
 ids=batchIds(ids);if(!['locations','chips','equipment'].includes(kind))throw fail(400,'Consulta inválida.');
 const devices=await scoped(pool,user,async c=>(await c.query('select id,serial,data,version from central_homologacao.devices where branch_id=$1 and id=any($2::uuid[]) and deleted_at is null',[branch,ids])).rows);
 if(devices.length!==ids.length)throw fail(403,'Aparelho indisponível nesta filial.');
 const results=await mapTwo(devices,async row=>{
  if(kind==='locations')return{location:await service.equipmentLocation(branch,row.serial)};
  if(kind==='chips'){const iccid=row.data.iccid;if(!/^89\d{17,18}$/.test(iccid||''))throw fail(422,'ICCID salvo inválido. Use Atualizar aparelhos.');let chip;try{chip=await service.carrier('arya',iccid);}catch(e){chip={ok:false,message:e.message};}if(!chip.ok)chip=await service.carrier('link',iccid);if(!chip.ok||chip.iccid!==iccid)throw fail(422,chip.message||'Chip não confirmado.');return{chip};}
  const equipment=await service.equipment(branch,row.serial),patch=equipmentPatch(equipment,row.serial);
  const device=await scoped(pool,user,async c=>{
   await c.query("select pg_advisory_xact_lock(hashtext($1))",['contact-chip:'+patch.iccid]);
   if((await c.query("select 1 from central_homologacao.devices where id<>$1 and deleted_at is null and data->>'iccid'=$2 limit 1",[row.id,patch.iccid])).rowCount)throw fail(409,'ICCID associado a outro cadastro. Confira antes de atualizar.');
   if(Object.entries(patch).every(([key,v])=>row.data[key]===v)){const current=(await c.query('select id,serial,data,version from central_homologacao.devices where id=$1 and branch_id=$2 and version=$3 and deleted_at is null',[row.id,branch,row.version])).rows[0];if(!current)throw fail(409,'Cadastro alterado durante a consulta.');return current;}
   await c.query("select set_config('central.chip_source','Atualizar aparelhos: API',true)");
   const saved=(await c.query('update central_homologacao.devices set data=data||$4::jsonb,version=version+1,updated_at=now() where id=$1 and branch_id=$2 and version=$3 and deleted_at is null returning id,serial,data,version',[row.id,branch,row.version,JSON.stringify(patch)])).rows[0];if(!saved)throw fail(409,'Cadastro alterado durante a consulta. Tente novamente.');
   await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'EQUIPMENT_REFRESH',row.id,{fields:Object.keys(patch),source:'platform_api'}]);return saved;
  });return{device:{...device.data,id:device.id,serial:device.serial,version:device.version,branch}};
 });return{ok:true,results,queried_at:new Date().toISOString()};
}
