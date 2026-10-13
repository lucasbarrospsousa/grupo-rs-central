import {randomUUID} from 'node:crypto';
import {activationSelection} from '../public/warehouse-activation-model.js';
const fail=(status,message)=>Object.assign(Error(message),{status});
const pending=v=>['0','PENDENTE','PENDING'].includes(String(v??'').trim().toUpperCase());
const active=v=>['ATIVO','ATIVA','ACTIVE','ATIVADO'].includes(String(v??'').trim().toUpperCase());
// Assisted workflow only. This module has no activation/reset transport.
export async function warehouseActivation(c,{body,branch,role,service}){
 if(branch!=='imperatriz'||role!=='admin')throw fail(403,'Ativação restrita ao armazém de Imperatriz.');
 const {action}=body;
 if(!['prepare','requested','check'].includes(action))throw fail(400,'Ação inválida.');
 await c.query("select pg_advisory_xact_lock(hashtext('warehouse-chip-activation'))");
 if(action==='prepare'){
  if(body.portalChecked!==true)throw fail(400,'Confira na Árya se os chips não possuem solicitação aberta.');
  if(![10,20].includes(body.size)||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>body.size||body.ids.some(id=>!/^\w{8}-(?:\w{4}-){3}\w{12}$/.test(id)))throw fail(400,'Seleção inválida.');
  const rows=(await c.query("select * from central_homologacao.warehouse_items where id=any($1::uuid[]) and branch_id='imperatriz' and deleted_at is null order by id for update",[body.ids])).rows;
  let selected;try{selected=activationSelection(rows,body.ids,body.size);}catch(e){throw fail(409,e.message);}
  const serials=selected.map(r=>r.serial);
  const duplicates=await c.query('select id from central_homologacao.warehouse_items where serial=any($1::text[]) and activation_state is not null',[serials]);
  if(duplicates.rowCount)throw fail(409,'Um desses ICCIDs já pertence a um lote. Nenhuma nova reserva criada.');
  for(const r of selected){
   const chip=await service.carrier('arya',r.serial);
   if(chip?.ok!==true||chip.iccid!==r.serial||chip.provider!=='arya'||!pending(chip.status))throw fail(409,'Chip '+r.serial+': situação pendente não confirmada. Nenhum lote criado.');
  }
  const id=randomUUID();
  await c.query("update central_homologacao.warehouse_items set activation_batch=$2,activation_state='prepared',activation_at=now(),classification='Reserva',version=version+1 where id=any($1::uuid[])",[body.ids,id]);
  return{id,response:{ok:true,id,count:selected.length,state:'prepared',iccids:serials}};
 }
 if(!/^[a-f0-9-]{36}$/.test(body.batch||''))throw fail(400,'Lote inválido.');
 const rows=(await c.query("select * from central_homologacao.warehouse_items where activation_batch=$1 and branch_id='imperatriz' order by id for update",[body.batch])).rows;
 if(!rows.length)throw fail(404,'Lote não encontrado.');
 if(action==='requested'){
  if(body.confirmed!==true||typeof body.reference!=='string'||!body.reference.trim()||body.reference.length>120||/[<>\x00-\x1f]/.test(body.reference))throw fail(400,'Informe o protocolo ou referência da solicitação enviada na Árya.');
  if(rows.some(r=>r.activation_state!=='prepared'))throw fail(409,'Este lote já foi registrado. Atualize a lista.');
  await c.query("update central_homologacao.warehouse_items set activation_state='requested',activation_reference=$2,activation_at=now(),version=version+1 where activation_batch=$1",[body.batch,body.reference.trim()]);
  return{id:body.batch,response:{ok:true,count:rows.length,state:'requested'}};
 }
 let confirmed=0,pendingCount=0,errors=0;
 for(const r of rows){
  if(r.activation_state==='active'){confirmed++;continue;}
  try{
   const chip=await service.carrier('arya',r.serial);
   if(chip?.ok!==true||chip.iccid!==r.serial||chip.provider!=='arya'){errors++;continue;}
   // Numeric active statuses are undocumented: never infer activation from a phone or OFF/ON alone.
   if(!active(chip.status)){pendingCount++;continue;}
   const phone=String(chip.phone||'').trim();if(phone.length>40){errors++;continue;}
   await c.query("update central_homologacao.warehouse_items set activation_state='active',activation_at=now(),chip_phone=case when $2<>'' then $2 else chip_phone end,version=version+1 where id=$1",[r.id,phone]);confirmed++;
  }catch{errors++;}
 }
 return{id:body.batch,response:{ok:true,count:rows.length,confirmed,pending:pendingCount,errors}};
}
