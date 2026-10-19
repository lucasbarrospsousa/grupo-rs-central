import {scoped} from './remote-actions.mjs';
import {openAryaActivations,submitAryaActivation} from './arya-activation.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export async function sendWarehouseActivation({pool,user,role,branch,body,service}){
 if(branch!=='imperatriz'||role!=='admin')throw fail(403,'Ativação restrita ao armazém de Imperatriz.');
 if(body.confirmed!==true||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(body.batch||''))throw fail(400,'Revise e confirme o lote.');
 const tx=fn=>scoped(pool,user,fn),batch=body.batch;
 // This committed fence survives a crash, lost response or a second browser tab.
 const items=await tx(async c=>{
  await c.query("select pg_advisory_xact_lock(hashtext('warehouse-chip-activation'))");
  let rows=(await c.query("select * from central_homologacao.warehouse_items where activation_batch=$1 and branch_id='imperatriz' order by id for update",[batch])).rows;
  if(!rows.length||rows.length>20)throw fail(409,'Lote não encontrado ou fora do limite.');
  if(rows.some(r=>['sending','uncertain'].includes(r.activation_state)))return [];
  rows=rows.filter(r=>r.activation_state==='prepared');if(!rows.length)return [];
  if(!Array.isArray(body.iccids)||body.iccids.length!==rows.length||new Set(body.iccids).size!==rows.length||!rows.every(r=>body.iccids.includes(r.serial)))throw fail(409,'ICCIDs do lote diferentes da seleção confirmada. Recarregue e revise antes de enviar.');
  if(rows.some(r=>r.deleted_at||r.kind!=='chip'||r.chip_provider!=='arya'||r.status!=='Disponível'||!/^89\d{17,18}$/.test(r.serial)))throw fail(409,'O lote mudou. Confira os chips.');
  await c.query("update central_homologacao.warehouse_items set activation_state='sending',activation_at=now(),version=version+1 where id=any($1::uuid[])",[rows.map(r=>r.id)]);
  await c.query("insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values('imperatriz',$1,'PREPARE_ARYA_ACTIVATION',$2,$3)",[user.user_id,batch,{count:rows.length,iccids:rows.map(r=>r.serial)}]);
  return rows;
 });
 if(!items.length)return {ok:true,state:'pending',message:'Este lote já possui tentativa registrada. Use Conferir ativação; nenhum reenvio foi feito.'};
 const update=(ids,state,reference='')=>tx(c=>c.query("update central_homologacao.warehouse_items set activation_state=$2,activation_reference=$3,activation_at=now(),version=version+1 where id=any($1::uuid[]) and activation_state='sending'",[ids,state,reference]));
 let selected=[],skipped=0;
 try{
  const open=await openAryaActivations(service);
  for(const r of items){
   if(open.has(r.serial)){await update([r.id],'requested','Chamado Árya '+open.get(r.serial));skipped++;continue;}
   const chip=await service.carrier('arya',r.serial);
   if(chip?.ok!==true||chip.iccid!==r.serial||chip.provider!=='arya'||!['0','PENDENTE','PENDING'].includes(String(chip.status).trim().toUpperCase()))throw fail(409,'Situação pendente não confirmada para um chip. Lote não enviado.');
   selected.push(r);
  }
 }catch(e){
  // Safe to release only here: no remote activation POST has been attempted.
  await update(items.map(r=>r.id),'prepared');throw e;
 }
 if(!selected.length)return {ok:true,state:'requested',sent:0,skipped,message:`${skipped} chips já tinham chamado aberto. Nenhum reenvio feito.`};
 let accepted=false;
 try{accepted=(await submitAryaActivation(service,selected.map(r=>r.serial))).accepted;}catch{/* No retry: provider may have accepted the job. */}
 await update(selected.map(r=>r.id),accepted?'requested':'uncertain',accepted?'Fila Árya aceita':'Resposta não confirmada');
 await tx(c=>c.query("insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values('imperatriz',$1,'SUBMIT_ARYA_ACTIVATION',$2,$3)",[user.user_id,batch,{count:selected.length,accepted,skipped,iccids:selected.map(r=>r.serial)}]));
 return {ok:true,state:accepted?'requested':'uncertain',sent:selected.length,skipped,message:accepted?`Lote enviado à fila da Árya: ${selected.length} chips. ${skipped} já pendentes foram ignorados. Aguarde a operadora.`:'Resposta do envio não confirmada. Lote bloqueado contra reenvio; use Conferir ativação.'};
}
