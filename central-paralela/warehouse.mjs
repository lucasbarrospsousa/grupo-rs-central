import {trackingDocument} from './drive.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const categories=['Estoque','Reserva','Emergência'];
const clean=v=>String(v??'').trim();
export async function warehouse({input:b,user,config,service,document=trackingDocument}){
 if(!user?.permissions?.views?.includes('warehouse')||!user.branches?.some(x=>x.id===b.branch))fail(403,'Sem acesso ao armazém desta filial.');
 const actions=['list','create','classify','remove','send','check'];
 if(!actions.includes(b.action))fail(400,'Ação inválida.');
 if(b.action!=='list'&&!user.permissions.owner&&!user.permissions.writes?.includes('warehouse'))fail(403,'Armazém somente para consulta.');
 const doc=await document(config,b.branch),d=doc.data;
 const store=d.warehouse||{rows:[],movements:[],audit:[],costs:null};
 if(b.action==='list')return {rows:store.rows.filter(r=>!r.deleted_at),movements:store.movements,costs:store.costs||null,branch:b.branch};
 if(!/^[a-f0-9-]{36}$/i.test(b.key||''))fail(400,'Chave de operação inválida.');
 const fingerprint=JSON.stringify({action:b.action,id:b.id,version:b.version,values:b.values,items:b.items,destination:b.destination,note:b.note,confirmed:b.confirmed});
 const prior=store.audit.find(a=>a.key===b.key);
 if(prior){if(prior.actor!==user.username||prior.fingerprint!==fingerprint)fail(409,'Chave já utilizada.');return {ok:true,replayed:true};}
 const now=new Date().toISOString(),active=store.rows.filter(r=>!r.deleted_at),row=active.find(r=>r.id===b.id);
 const event=(r,type,extra={})=>store.movements.push({id:crypto.randomUUID(),serial:r.serial,kind:r.kind,type,atISO:now,branch:b.branch,actor:user.username,...extra});
 const match=()=>{if(!row)fail(404,'Item não encontrado.');if(row.version!==b.version)fail(409,'Item alterado. Recarregue os dados.');return row;};
 if(store.audit.length>=20000||store.movements.length>=50000)fail(409,'Limite de histórico atingido.');
 if(b.action==='create'){
  const v=b.values||{},kind=v.kind,serial=clean(v.serial),classification=clean(v.classification);
  if(!['device','chip'].includes(kind)||!(kind==='chip'?/^89\d{17,18}$/:/^\d{9}$/).test(serial)||!categories.includes(classification))fail(400,'Série, ICCID ou classificação inválidos.');
  if(active.some(r=>r.kind===kind&&r.serial===serial))fail(409,'Item já cadastrado nesta filial.');
  if(active.length>=20000)fail(409,'Limite de itens atingido.');
  let chip={};
  if(kind==='chip'){
   if(!['arya','link'].includes(v.provider))fail(400,'Selecione o provedor.');
   chip=await service.carrier(v.provider,serial);
   if(!chip.ok||chip.iccid!==serial)fail(422,'O provedor não confirmou esse ICCID.');
  }
  const result={id:crypto.randomUUID(),version:1,kind,serial,classification,status:'Disponível',received_at:now,branch:b.branch,chip_provider:chip.provider||'',chip_operator:chip.operator||'',chip_phone:chip.phone||'',chip_status:chip.status||'',checked_at:chip.queried_at||null};
  store.rows.push(result);event(result,'Entrada');
 }else if(b.action==='send'){
  if(b.confirmed!==true)fail(400,'Revise e confirme o envio.');
  const dest=clean(b.destination),note=clean(b.note);
  if(!dest||dest.length>120||dest===b.branch||note.length>1500||!Array.isArray(b.items)||!b.items.length||b.items.length>100)fail(400,'Destino ou seleção inválidos.');
  if(new Set(b.items.map(i=>i.id)).size!==b.items.length)fail(400,'Seleção repetida.');
  const selected=b.items.map(i=>{const r=active.find(r=>r.id===i.id);if(!r||r.kind!=='device'||r.status!=='Disponível'||r.version!==i.version)fail(409,'A seleção mudou. Recarregue antes de enviar.');return r;});
  for(const r of selected){r.status='Enviado';r.destination=dest;r.version++;event(r,'Envio',{destination:dest,note});}
 }else{
  match();
  if(b.action==='classify'){if(!categories.includes(b.values?.classification)||row.status!=='Disponível')fail(400,'Classificação inválida para este item.');row.classification=b.values.classification;event(row,'Classificação',{note:row.classification});}
  if(b.action==='remove'){if(row.status!=='Disponível'||b.confirmed!==true)fail(400,'Confirme a remoção de um item disponível.');row.deleted_at=now;event(row,'Remoção');}
  if(b.action==='check'){
   if(row.kind!=='chip')fail(400,'Selecione um chip.');
   if(Date.now()-Date.parse(row.checked_at||'')<60000)fail(429,'Chip conferido recentemente. Aguarde um minuto.');
   const chip=await service.carrier(row.chip_provider,row.serial);
   if(!chip.ok||chip.iccid!==row.serial)fail(422,'Consulta não confirmada. Dados anteriores preservados.');
   Object.assign(row,{chip_operator:chip.operator,chip_phone:chip.phone,chip_status:chip.status,checked_at:chip.queried_at});
  }
  row.version++;
 }
 store.audit.push({key:b.key,fingerprint,actor:user.username,at:now});d.warehouse=store;await doc.save();return {ok:true};
}
