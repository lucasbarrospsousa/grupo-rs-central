// Contracts observed in the Arya web client on 2026-10-13. No reset operation.
const fail=()=>Object.assign(Error('Não foi possível conferir todos os chamados da Árya. Nenhum envio liberado.'),{status:502});
const ticketDate=value=>{const m=String(value||'').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/);return m?Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}-03:00`):NaN;};
export async function finishedAryaActivations(service,items){
 const wanted=new Map(items.map(r=>[r.serial,r])),found=new Map(),seen=new Set();let total;
 if(!wanted.size)return found;
 for(let page=1;page<=20;page++){
  const d=await service.aryaRequest('/ticket/user/table',{page,per_page:100,filters:{type:3,status:'1'}});
  if(d?.status!==true||!Array.isArray(d.data)||d.current_page!==page||!Number.isInteger(d.last_page)||d.last_page<page||!Number.isInteger(d.total_filtered)||d.total_filtered<0||(total!==undefined&&total!==d.total_filtered))throw fail();
  total=d.total_filtered;
  for(const row of d.data){
   if(row.type!=='Ativação'||row.statusInt!==1||row.status!=='Finalizado'||!row.id||seen.has(String(row.id)))throw fail();
   seen.add(String(row.id));const item=wanted.get(row.iccid);if(!item)continue;
   const reference=String(item.activation_reference||'').match(/^Chamado Árya (\d+)$/)?.[1];
   // Exact recorded ticket or a ticket created during this attempt, never an old activation.
   const requested=Date.parse(item.activation_at),created=ticketDate(row.createdAt),ended=ticketDate(row.endedAt);
   if(reference?String(row.id)!==reference:(!Number.isFinite(requested)||!Number.isFinite(created)||created<requested-120000))continue;
   if(!Number.isFinite(ended)||ended<created)continue;
   const phone=String(row.msisdn||'').trim();if(phone&&!/^\+?\d{8,20}$/.test(phone))throw fail();
   found.set(row.iccid,{id:String(row.id),phone});
  }
  if(found.size===wanted.size)return found;
  if(page===d.last_page){if(seen.size!==total)throw fail();return found;}
  if(!d.data.length)throw fail();
 }
 throw fail();
}
export async function openAryaActivations(service){
 const found=new Map();
 for(const status of [0,2]){
  let total=null,seen=0;const ids=new Set();
  for(let page=1;page<=20;page++){
   const d=await service.aryaRequest('/ticket/user/table',{page,per_page:100,filters:{type:3,status:String(status)}});
   if(d?.status!==true||!Array.isArray(d.data)||d.current_page!==page||!Number.isInteger(d.last_page)||d.last_page<page||d.last_page>20||!Number.isInteger(d.total_filtered)||d.total_filtered<0)throw fail();
   if(total!==null&&total!==d.total_filtered)throw fail();total=d.total_filtered;
   for(const row of d.data){
    if(!/^89\d{17,18}$/.test(row.iccid)||row.type!=='Ativação'||row.statusInt!==status||!row.id||ids.has(String(row.id)))throw fail();
    ids.add(String(row.id));seen++;found.set(row.iccid,String(row.id));
   }
   if(page===d.last_page){if(seen!==total)throw fail();break;}
   if(!d.data.length)throw fail();
  }
 }
 return found;
}
export async function submitAryaActivation(){throw Object.assign(Error('Envio de ativações desativado na Central.'),{status:410});}
