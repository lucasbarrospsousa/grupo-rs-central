// Contracts observed in the Arya web client on 2026-10-13. No reset operation.
const fail=()=>Object.assign(Error('Não foi possível conferir todos os chamados da Árya. Nenhum envio liberado.'),{status:502});
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
export async function submitAryaActivation(service,iccids){
 if(!Array.isArray(iccids)||!iccids.length||iccids.length>20||new Set(iccids).size!==iccids.length||iccids.some(v=>typeof v!=='string'||!/^89\d{17,18}$/.test(v)))throw Error('Lote de ativação inválido.');
 // Never retry this POST, including authentication errors or timeouts.
 const result=await service.aryaRequest('/tickets/bulk/by-iccid',{iccids,type:3},{write:true});
 return {accepted:result?.status===true};
}
