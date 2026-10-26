// Inventory transactions share the Operations single writer with telemetry.
import {standardSms} from './sms-template.mjs';
import {digest,randomToken} from './auth-crypto.mjs';
import {trackingDocument} from './drive.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const statuses=['Estoque','Reserva','Instalado','Manutenção','Inativos'];
const fields=['identification','plate','model','carrier','iccid','phone','apn'];
const clean=v=>String(v??'').trim();
export const canWrite=u=>u?.permissions?.owner===true||u?.permissions?.writes?.includes('stock');
export async function inventory({input:b,user,config,service,document=trackingDocument}){
 if(!user?.permissions?.views?.includes('stock')||!user.branches?.some(x=>x.id===b.branch))fail(403,'Sem acesso à filial.');
 const action=String(b.action||''),reads=['operations','analyze','lookup','link-preview','integrations','sms-template'];
 if(!reads.includes(action)&&!(action.startsWith('sms-')?(user.permissions.owner||user.permissions.writes?.includes('sms')):action==='gateway-pair'?user.permissions.owner:canWrite(user)))fail(403,'Usuário somente de leitura.');
 if(['link-preview','analyze','lookup'].includes(action)&&!canWrite(user))fail(403,'Sem permissão de vinculação.');
 const doc=await document(config,b.branch),data=doc.data;data.operations??=[];data.audit??=[];
 const fingerprint=JSON.stringify({action,id:b.id||'',values:b.values,plate:b.plate,operation:b.operation,command:b.command,phone:b.phone});
 const replay=data.audit.find(a=>a.key===b.key);if(replay){if(replay.actor!==user.username||replay.fingerprint!==fingerprint)fail(409,'Chave já utilizada.');return {ok:true,replayed:true,row:data.rows.find(r=>r.id===replay.result_id&&!r.deleted_at)||null};}
 const active=()=>data.rows.filter(r=>!r.deleted_at),row=active().find(r=>r.id===b.id);
 if(action==='integrations')return {ok:true,apis:'Consultas diretas configuradas',storage:'Drive independente',sms:{connected:!!data.gateway&&Date.now()-Date.parse(data.gateway.last_seen||'')<120000,send_enabled:!!data.gateway&&Date.now()-Date.parse(data.gateway.last_seen||'')<120000,message:data.gateway?.last_seen?'Último contato do Galaxy: '+data.gateway.last_seen:'Conexão própria do Galaxy ainda não autorizada. Nenhum envio disponível.'}};
 if(action==='operations')return {rows:data.operations.filter(o=>o.kind!=='sms'||user.permissions.owner||user.permissions.writes?.includes('sms')).map(({payload,...op})=>op).slice(-100).reverse()};
 if(action==='lookup'){if(!/^\d{9}$/.test(b.serial||''))fail(400,'Série deve ter 9 dígitos.');const e=await service.equipment(b.branch,b.serial);return {row:Object.fromEntries(['serial',...fields].map(k=>[k,e[k]||'']))};}
 if(action==='gateway-pair'){if(!user.permissions.owner)fail(403,'Somente administrador.');const token=randomToken();data.gateway={token_hash:digest(token),created_at:new Date().toISOString(),last_seen:null};await doc.save();return {token,endpoint:'/api/galaxy',branch:b.branch};}
 if(!['create'].includes(action)&&!row)fail(404,'Aparelho não encontrado nesta filial.');
 if(action==='sms-template'){if(!(user.permissions.owner||user.permissions.writes?.includes('sms')))fail(403,'Sem permissão de SMS.');return standardSms(row.serial,row.apn);}
 if(action==='analyze'){const result=await service.binding(b.branch,row.serial);return {result};}
 const version=Number(row?.version||1);
 if(!reads.includes(action)&&action!=='create'&&Number(b.version)!==version)fail(409,'Cadastro mudou. Recarregue antes de continuar.');
 if(action==='link-preview'){
  if(!['Estoque','Reserva','Manutenção'].includes(row.status))fail(409,'Aparelho fora do estoque/reserva/reparo.');
  const previous=data.operations.find(o=>o.serial===row.serial&&o.kind==='link'&&['prepared','submitted','pending'].includes(o.state));
  if(previous)return {operation:{id:previous.id,state:previous.state,plate:previous.plate,message:previous.message}};
  const prefix=({'7.3.2':'GRS','7.3.5':'XRS','7.2.2':'AAA','7.1.6':'AAA','7.2.2/7.1.6':'AAA'})[clean(row.model).replace(/^V/i,'')];
  if(!prefix)fail(422,'Salve a versão do aparelho antes de vincular.');
  let identification=clean(b.identification);
  if(!identification){const owner=await service.linkStockOwner(b.branch);const occupied=new Set([...owner.vehicles.map(v=>v.plate),...data.operations.filter(o=>o.kind==='link').map(o=>o.plate),...active().map(r=>r.identification)].map(x=>clean(x).replace(/[\s-]/g,'').toUpperCase()));let n=450;while(occupied.has(prefix+n)&&n<999999)n++;identification=prefix+' - '+n;}
  const preview=await service.prepareLink(b.branch,row.serial,identification);
  const op={id:crypto.randomUUID(),kind:'link',serial:row.serial,device_id:row.id,version,state:preview.confirmed?'confirmed':'prepared',plate:preview.plate,payload:preview.payload,created_at:new Date().toISOString(),actor:user.username,message:preview.confirmed?'Vínculo já confirmado.':'Preparado; aguarda confirmação.'};
  data.operations.push(op);await doc.save();return {operation:{id:op.id,state:op.state,plate:op.plate,message:op.message}};
 }
 if(!/^[a-f0-9-]{36}$/i.test(b.key||''))fail(400,'Chave da operação inválida.');

 const now=new Date().toISOString();let result=row;
 if(action==='create'||action==='edit'){
  const values=b.values||{},serial=clean(values.serial||row?.serial);
  if(!/^\d{9}$/.test(serial)||row&&serial!==row.serial)fail(400,'Série inválida ou alterada.');
  if(active().some(r=>r.serial===serial&&r.id!==row?.id))fail(409,'Série já cadastrada.');
  if(!statuses.includes(values.status))fail(400,'Situação inválida.');
  if(values.status==='Instalado'&&row?.status!=='Instalado')fail(400,'Use Dar baixa para registrar instalação.');
  const valuesSafe={};for(const k of fields){valuesSafe[k]=clean(values[k]);if(valuesSafe[k].length>120)fail(400,'Campo muito longo.');}
  if(valuesSafe.iccid&&!/^89\d{17,18}$/.test(valuesSafe.iccid))fail(400,'ICCID inválido.');
  if(valuesSafe.phone&&!/^\+?[\d ()-]{10,20}$/.test(valuesSafe.phone))fail(400,'Telefone inválido.');
  result=row||{id:crypto.randomUUID(),serial,created_at:now,version:0};Object.assign(result,valuesSafe,{status:values.status});if(!row)data.rows.push(result);
 }else if(action==='delete'){if(b.confirmed!==true)fail(400,'Confirme a exclusão.');row.deleted_at=now;}
 else if(action==='install'){
  if(!['Estoque','Reserva','Manutenção'].includes(row.status))fail(409,'Situação não permite baixa.');
  if(b.confirmed!==true)fail(400,'Confirme a baixa.');const plate=clean(b.plate).toUpperCase().replace(/[\s-]/g,'');if(!/^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(plate))fail(400,'Placa inválida.');
  row.plate=plate;row.status='Instalado';row.installed_at=now;
 }else if(action==='refresh-equipment'){
  const e=await service.equipment(b.branch,row.serial);if(e.serial!==row.serial||!e.ok)fail(422,'Série não confirmada.');
  for(const k of ['iccid','phone','carrier','apn'])if(e[k])row[k]=e[k];
  if(row.status==='Instalado'&&clean(e.plate).replace(/\W/g,'').toUpperCase()===clean(row.plate).replace(/\W/g,'').toUpperCase()&&e.client&&Number(e.owner_count)<=1)row.owner_binding={branch:b.branch,serial:row.serial,plate:row.plate,client:e.client,checked_at:now};
 }else if(action==='link-confirm'||action==='link-check'||action==='link-cancel'){
  const op=data.operations.find(o=>o.id===b.operation&&o.device_id===row.id);if(!op)fail(404,'Vinculação não encontrada.');
  if(action==='link-cancel'){if(op.state!=='prepared')fail(409,'Envio já iniciado; confira o resultado.');op.state='cancelled';op.message='Cancelado antes do envio.';}
  else if(action==='link-check'){
   const proof=await service.prepareLink(b.branch,row.serial,op.plate);if(!proof.confirmed)fail(409,'Vínculo não confirmado. Nenhum reenvio realizado.');op.state='confirmed';op.message='Vínculo confirmado.';row.identification=op.plate;
  }else{
   if(op.state!=='prepared'||op.version!==version||b.confirmed!==true)fail(409,'Vínculo já enviado ou cadastro mudou. Confira sem reenviar.');
   op.state='submitted';op.message='Envio iniciado; conferir se houver interrupção.';await doc.save();
   try{await service.createLink(b.branch,op.payload);const proof=await service.prepareLink(b.branch,row.serial,op.plate);if(!proof.confirmed)throw Error('Resposta sem confirmação do vínculo.');op.state='confirmed';op.message='Vínculo confirmado.';row.identification=op.plate;}
   catch{op.state='pending';op.message='Envio inconclusivo. Use Conferir; não será reenviado automaticamente.';}
  }
 }else if(action==='sms-draft'||action==='sms-send'){
  if(!(user.permissions.owner||user.permissions.writes?.includes('sms')))fail(403,'Sem permissão de SMS.');
  if(!row||!/^024\d{6}$/.test(row.serial))fail(400,'SMS disponível para aparelhos 024.');
  const command=clean(b.command);if(!command||command.length>160||/[^\x20-\x7e]/.test(command))fail(400,'Use até 160 caracteres simples.');
  let phone='';if(action==='sms-send'){if(b.confirmed!==true||!data.gateway||Date.now()-Date.parse(data.gateway.last_seen||'')>=120000||!Number.isFinite(Date.parse(data.gateway.last_seen||'')))fail(409,'Galaxy próprio não conectado.');const e=await service.equipment(b.branch,row.serial);phone=clean(e.phone).replace(/\D/g,'');if(e.serial!==row.serial||!/^\d{10,13}$/.test(phone)||phone!==clean(b.phone).replace(/\D/g,''))fail(409,'Telefone não confirmado. Atualize o aparelho.');}
  data.operations.push({id:crypto.randomUUID(),kind:'sms',phone,device_id:row.id,serial:row.serial,state:action==='sms-send'?'queued':'blocked',command,created_at:now,actor:user.username,message:action==='sms-send'?'Aguardando Galaxy.':'Rascunho salvo; não enviado.'});
 }else fail(400,'Ação inválida.');
 if(result&&!action.startsWith('sms-')){result.version=Number(result.version||1)+1;result.updated_at=now;}
 data.audit.push({key:b.key,fingerprint,action,actor:user.username,device_id:b.id||'',result_id:result?.id,at:now});
 if(data.audit.length>20000)fail(409,'Limite do registro de auditoria atingido. Arquive antes de continuar.');
 await doc.save();return {ok:true,row:result?.deleted_at?null:result,operations:data.operations.filter(o=>o.kind!=='sms'||user.permissions.owner||user.permissions.writes?.includes('sms')).map(({payload,...op})=>op).slice(-100).reverse()};
}
