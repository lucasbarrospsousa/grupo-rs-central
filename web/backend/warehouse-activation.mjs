import {aryaCostSnapshot} from './warehouse-costs.mjs';
import {randomUUID} from 'node:crypto';
const fail=(status,message)=>Object.assign(Error(message),{status});
export async function warehouseActivation(c,{body,branch,role,service}){
 if(branch!=='imperatriz'||role!=='admin')throw fail(403,'Conferência restrita ao armazém de Imperatriz.');
 if(body.action!=='check')throw fail(410,'A Central não envia nem prepara ativações. Use a ativação manual na operadora.');
 if(body.batch&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(body.batch))throw fail(400,'Lote inválido.');
 await c.query("select pg_advisory_xact_lock(hashtext('warehouse-chip-activation'))");
 const rows=(await c.query("select * from central_homologacao.warehouse_items where ($1::uuid is null or activation_batch=$1) and branch_id='imperatriz' and kind='chip' and chip_provider='arya' and status='Disponível' and classification='Reserva' and deleted_at is null order by id for update",[body.batch||null])).rows;
 const available=rows.filter(r=>r.kind==='chip'&&r.chip_provider==='arya'&&r.status==='Disponível'&&r.classification==='Reserva');
 if(!available.length)return {id:body.batch||randomUUID(),response:{ok:true,ids:[],count:0,confirmed:0,pending:0,errors:0,message:'Nenhum chip Árya em Reserva para conferir.'}};
 // A single inventory read also covers manual activations without a Central batch.
 const snapshot=await aryaCostSnapshot(service,{maxAgeMs:60000});
 const confirmationBatch=body.batch||randomUUID();const ids=[];let pending=0,missing=0;
 for(const r of available){const chip=snapshot.rows.get(r.serial);if(chip?.active&&chip.phone&&!/^\+?\d{8,20}$/.test(chip.phone))throw fail(502,'Telefone inválido retornado pela Árya. Conferência não gravada.');}
 for(const r of available){
  const chip=snapshot.rows.get(r.serial);
  if(!chip){missing++;continue;}
  if(!chip.active){pending++;continue;}
  const updated=await c.query("update central_homologacao.warehouse_items set activation_batch=coalesce(activation_batch,$3::uuid),activation_state='active',classification='Estoque',activation_at=now(),activation_reference=case when coalesce(activation_reference,'')='' then 'Ativação manual confirmada na Árya' else activation_reference end,chip_phone=case when $2<>'' then $2 else chip_phone end,version=version+1 where id=$1 and status='Disponível' and classification='Reserva' and deleted_at is null returning id",[r.id,chip.phone||'',confirmationBatch]);
  if(updated.rowCount)ids.push(r.id);
 }
 return {id:body.batch||randomUUID(),response:{ok:true,ids,count:available.length,confirmed:ids.length,pending,errors:missing,checked_at:snapshot.checked_at,message:ids.length+' ativos confirmados • '+pending+' ainda não ativos • '+missing+' não localizados. Consulta: '+new Date(snapshot.checked_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})+'.'}};
}
