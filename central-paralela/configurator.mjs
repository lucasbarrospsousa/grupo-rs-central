import {digest} from './auth-crypto.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
export function validateConfig(p){
 if(!['imperatriz','araguaina','acailandia','maraba'].includes(p.branch)||!/^\d{9}(?:\d{6})?$/.test(p.serial||''))fail(400,'Filial ou série inválida.');
 if(p.action==='preflight')return;
 if(!['prepare','save'].includes(p.action)||!/^89\d{17,18}$/.test(p.iccid||'')||!/^\d{10,13}$/.test(p.phone||'')||!['hinova.br','linksolutions.br'].includes(p.apn)||!['VIVO','TIM','CLARO','MULTIOPERADORA','MULTI OPERADORA'].includes(p.operator)||!Number.isInteger(p.version)||p.version<0||!/^[a-f0-9-]{36}$/i.test(p.key||''))fail(400,'Dados do Configurador inválidos.');
 if(p.tracker_version&&!/^V7\.\d+\.\d+$/.test(p.tracker_version)||p.status&&!['Estoque','Reserva','Instalado','Manutenção'].includes(p.status))fail(400,'Versão ou situação inválida.');
}
export async function prepareConfig({p,user,documents,service}){
 validateConfig(p);if(!user?.active||!(user.permissions.owner||user.permissions.writes?.includes('stock'))||!user.branches.some(b=>b.id===p.branch))fail(403,'Filial não autorizada.');
 const all=Object.entries(documents).flatMap(([branch,doc])=>doc.data.rows.filter(r=>!r.deleted_at&&r.serial===p.serial).map(r=>({branch,row:r})));if(all.length>1)fail(409,'Série duplicada.');
 const old=all[0],dest=documents[p.branch].data;
 if(old&&!user.branches.some(b=>b.id===old.branch))fail(403,'Sem acesso à origem.');
 if(p.action==='preflight')return {response:{ok:true,version:old?.row.version||0,exists:!!old,branch:p.branch,database:'Central Drive'}};
 const fingerprint=digest(JSON.stringify([p.branch,p.serial,p.iccid,p.phone,p.operator,p.version,p.apn,p.tracker_version||'',p.status||''])),prior=dest.configuratorReceipts?.[p.key];
 if(prior){if(prior.fingerprint!==fingerprint)fail(409,'Chave reutilizada.');if(prior.response.confirmed||p.action==='prepare')return {response:prior.response};}
 if((old?.row.version||0)!==p.version)fail(409,'Cadastro alterado. Faça nova conferência.');
 if(old&&old.branch===p.branch&&p.branch!=='imperatriz'&&old.row.status==='Instalado'&&!p.status)fail(409,'Aparelho instalado.');
 for(const [branch,doc]of Object.entries(documents)){
  if(doc.data.rows.some(r=>!r.deleted_at&&r.iccid===p.iccid&&r.serial!==p.serial))fail(409,'Chip associado a outro aparelho.');
  if(old&&old.branch!==p.branch&&doc.data.operations?.some(o=>o.serial===p.serial&&!['complete','cancelled','failed','expired','delivered','sent'].includes(o.state)))fail(409,'Operação pendente na origem.');
 }
 const response={ok:true,confirmed:p.action==='save',pending:p.action==='prepare',branch:p.branch,serial:p.serial,database:'Central Drive'};
 const changes=[];
 if(p.action==='save'){
  const remote=await service.equipment(p.branch,p.serial);if(remote.ok===false||remote.serial!==p.serial||remote.iccid!==p.iccid||phone(remote.phone)!==phone(p.phone))fail(409,'Cadastro não confirmado na plataforma.');
  const transfer=old&&old.branch!==p.branch,status=p.status||(p.branch!=='imperatriz'?'Estoque':old&&!transfer?'Manutenção':'Reserva');
  const row={...(!transfer?old?.row:{}),id:transfer?crypto.randomUUID():old?.row.id||crypto.randomUUID(),serial:p.serial,iccid:p.iccid,phone:p.phone,carrier:p.operator,model:p.tracker_version||old?.row.model||'RS300',tracker_version:p.tracker_version||old?.row.tracker_version||'',apn:p.apn,status,version:(old?.row.version||0)+1,updated_at:new Date().toISOString(),remote_registration_status:'confirmado_configurador_rs300'};
  if(status!=='Instalado')row.installed_at='';
  changes.push({branch:p.branch,kind:'device',row});if(transfer)changes.push({branch:old.branch,kind:'remove',id:old.row.id,version:(old.row.version||0)+1});
  const chips=Object.entries(documents).flatMap(([branch,d])=>(d.data.warehouse?.rows||[]).filter(r=>!r.deleted_at&&r.kind==='chip'&&r.serial===p.iccid).map(row=>({branch,row})));
  if(chips.length>1)fail(409,'ICCID duplicado no armazém.');
  if(chips.length){const c=chips[0];if(!user.branches.some(b=>b.id===c.branch)||!['Disponível','Enviado','Utilizado'].includes(c.row.status))fail(409,'Confira o chip no armazém de origem.');changes.push({branch:c.branch,kind:'chip',id:c.row.id,serial:p.serial,destination:p.branch});}
  Object.assign(response,{id:row.id,version:row.version,status,created:!old,transferred:!!transfer});
 }
 changes.push({branch:p.branch,kind:'receipt',key:p.key,value:{fingerprint,response}});
 return {plan:{schemaVersion:1,users:[],id:p.key,changes,response,actor:user.username}};
}
export function applyConfigChange(data,change,plan){
 data.configuratorApplied??={};const key=plan.id+':'+change.kind+':'+String(plan.response.confirmed);if(data.configuratorApplied[key])return;
 if(change.kind==='device'){const i=data.rows.findIndex(r=>r.id===change.row.id);if(i<0)data.rows.push(change.row);else data.rows[i]=change.row;}
 if(change.kind==='remove'){const row=data.rows.find(r=>r.id===change.id);row.deleted_at=new Date().toISOString();row.version=change.version;}
 if(change.kind==='chip'){const row=data.warehouse.rows.find(r=>r.id===change.id);if(!(row.status==='Utilizado'&&row.usage_device_serial===change.serial&&row.usage_branch===change.destination)){Object.assign(row,{status:'Utilizado',usage_device_serial:change.serial,usage_branch:change.destination,usage_detected_at:new Date().toISOString(),version:(row.version||0)+1});(data.warehouse.movements??=[]).push({id:plan.id,kind:'chip',serial:row.serial,type:'Utilizado',atISO:row.usage_detected_at,branch:change.branch,destination:change.destination,deviceSerial:change.serial,actor:plan.actor});}}
 if(change.kind==='receipt'){data.configuratorReceipts??={};data.configuratorReceipts[change.key]=change.value;}
 data.configuratorApplied[key]=new Date().toISOString();
}
