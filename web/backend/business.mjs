import {trackerClassification} from '../public/tracker-classification.js';
import {integrations} from './integrations.mjs';
import {randomUUID} from 'node:crypto';
const failure=(status,message)=>Object.assign(Error(message),{status});
export async function businessMutation(c,{path,method,body,branch,user,role,service=integrations}){
 const id=randomUUID();
 if(path==='/api/install'&&method==='POST'){
  if(role==='reader')throw failure(403,'Usuário somente de leitura.');
  if(body.confirmed!==true||typeof body.id!=='string'||!Number.isInteger(body.version)||typeof body.plate!=='string'||!body.plate.trim()||body.plate.length>20||/[\x00-\x1f<>]/.test(body.plate))throw failure(400,'Confirme a baixa e informe uma placa válida.');
  const row=(await c.query('select id,serial,data,version from central_homologacao.devices where id=$1 and branch_id=$2 and deleted_at is null for update',[body.id,branch])).rows[0];
  if(!row||row.version!==body.version||!['Estoque',...(branch==='imperatriz'?[]:['Reserva'])].includes(row.data.status))throw failure(409,'Cadastro mudou ou não está em estoque. Atualize a lista.');
  const now=new Date().toISOString(),plate=body.plate.trim().toUpperCase();
  const data={...row.data,status:'Instalado',plate,model:trackerClassification(row.data.identification,row.data.model),installed_at:now,discharged_at:now,updated_at:now};
  await c.query('update central_homologacao.devices set data=$2,version=version+1,updated_at=now() where id=$1',[row.id,data]);
  return {id:row.id,response:{ok:true,id:row.id,version:row.version+1,plate}};
 }

 if(path==='/api/maintenance'&&method==='POST'){
  if(!['Sem comunicação','Localização errada','Troca de aparelho'].includes(body.reason)||typeof body.medium!=='string'||body.medium.length>100||typeof body.notes!=='string'||body.notes.length>2000)throw failure(400,'Dados do atendimento inválidos.');
  const changing=body.reason==='Troca de aparelho';
  if(changing&&!body.replacement)throw failure(422,'Selecione o aparelho de reposição.');
  if(!changing&&body.replacement)throw failure(422,'Reposição permitida somente para troca de aparelho.');
  const ids=[body.vehicle,...(changing?[body.replacement]:[])];
  const locked=(await c.query('select id,serial,data,version from central_homologacao.devices where id=any($1::uuid[]) and branch_id=$2 and deleted_at is null order by id for update',[ids,branch])).rows;
  const row=locked.find(r=>r.id===body.vehicle),replacement=locked.find(r=>r.id===body.replacement);
  if(!row)throw failure(404,'Aparelho não encontrado nesta filial.');
  if(changing&&(!replacement||replacement.id===row.id||!['Estoque',...(branch==='imperatriz'?[]:['Reserva'])].includes(replacement.data.status)||replacement.version!==body.replacementVersion||row.version!==body.vehicleVersion))throw failure(409,'Aparelho de reposição indisponível ou cadastro alterado. Atualize a lista.');
  if(changing&&(!row.data.plate||row.data.status!=='Instalado'))throw failure(422,'Selecione o aparelho instalado no veículo de chegada.');
  const entry=new Date().toISOString();
  await c.query('insert into central_homologacao.visits(id,branch_id,device_id,data) values($1,$2,$3,$4)',[id,branch,row.id,{status:'Em análise',client:row.data.client||'',plate:row.data.plate||'',currentSerial:row.serial,reason:body.reason,medium:body.medium,notes:body.notes,entry,...(changing?{installSerial:replacement.serial,replacementId:replacement.id,stockDischarged:true,installationSource:'Relatório local; vínculo remoto não alterado'}:{})}]);
  if(changing){
   await c.query("update central_homologacao.devices set data=data||$3::jsonb,version=version+1,updated_at=now() where id=$1 and branch_id=$2",[replacement.id,branch,JSON.stringify({status:'Instalado',plate:row.data.plate,client:row.data.client||'',installed_at:entry,installation_source:'maintenance_local',maintenance_visit:id})]);
   await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'MAINTENANCE_DISCHARGE',replacement.id,{visit:id,beforeVersion:replacement.version,source:'Relatório local; sem escrita na plataforma'}]);
  }
  return{id,response:{ok:true,id}};
 }
 if(path.startsWith('/api/maintenance/')&&method==='PATCH'){
  const target=path.split('/').at(-1);
  if(!['Em análise','Aguardando','Concluída'].includes(body.status)||typeof body.notes!=='string'||body.notes.length>2000)throw failure(400,'Situação ou relato inválido.');
  const result=await c.query("update central_homologacao.visits set data=data||$4::jsonb,version=version+1,updated_at=now() where id=$1 and branch_id=$2 and version=$3 returning id",[target,branch,body.version,JSON.stringify({status:body.status,notes:body.notes})]);
  if(!result.rowCount)throw failure(409,'Atendimento alterado por outra sessão. Atualize a lista.');
  return{id:target,response:{ok:true,id:target}};
 }
 if(path==='/api/bulk'&&method==='POST'){
  if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>500)throw failure(400,'Envie entre 1 e 500 registros.');
  const seen=new Set();
  for(const row of body.rows){
   if(!/^\d{9}$/.test(row.serial||'')||seen.has(row.serial))throw failure(400,'Lista com série inválida ou repetida.');
   seen.add(row.serial);
   if(Object.keys(row).some(k=>!['serial','plate','carrier'].includes(k))||Object.values(row).some(v=>typeof v!=='string'||v.length>120))throw failure(400,'Campos inválidos na lista.');
  }
  const created=[];
  for(const row of body.rows){const deviceId=randomUUID();await c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[deviceId,branch,row.serial,{...row,branch,identification:row.plate||'',plate:'',status:'Estoque',client:'',model:'',installed_at:'',communication:'Não consultado',connectivity:'Não consultado',updated_at:new Date().toISOString()}]);created.push(deviceId);}
  return {id,response:{ok:true,id,count:created.length,ids:created}};
 }
 if(role!=='admin')throw failure(403,'Armazém exige permissão administrativa nesta filial.');
 if(path==='/api/warehouse'&&method==='POST'){
  if(!['device','chip'].includes(body.kind))throw failure(400,'Tipo inválido.');
  if(body.kind==='chip'){const checked=await service.carrier('arya',body.serial);if(!checked.ok)throw failure(422,'ICCID não confirmado pela Arya.');}else if(!/^\d{9}$/.test(body.serial||''))throw failure(400,'Informe a série com nove dígitos.');
  await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,$2,$4,$3,'Disponível',now())",[id,branch,body.serial,body.kind]);
  return {id,response:{ok:true,id}};
 }
 if(path.startsWith('/api/warehouse/')&&method==='DELETE'){
  const target=path.split('/').at(-1);
  const result=await c.query("update central_homologacao.warehouse_items set deleted_at=now(),version=version+1 where id=$1 and branch_id=$2 and version=$3 and status='Disponível' and deleted_at is null returning id",[target,branch,body.version]);
  if(!result.rowCount)throw failure(409,'Item indisponível ou alterado. Atualize a lista.');
  return {id:target,response:{ok:true,id:target}};
 }
 if(path==='/api/warehouse-transfer'&&method==='POST'){
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>100||new Set(body.items.map(i=>i.id)).size!==body.items.length)throw failure(400,'Selecione até 100 itens distintos.');
  if(typeof body.destination!=='string'||!body.destination.trim()||body.destination.length>120||typeof body.note!=='string'||body.note.length>500)throw failure(400,'Destino ou observação inválidos.');
  const rows=(await c.query('select * from central_homologacao.warehouse_items where id=any($1::uuid[]) and branch_id=$2 and deleted_at is null order by id for update',[body.items.map(i=>i.id),branch])).rows;
  if(rows.length!==body.items.length||rows.some(r=>r.status!=='Disponível'||r.version!==body.items.find(i=>i.id===r.id).version))throw failure(409,'Um item já foi movimentado ou alterado. Nenhum item foi enviado.');
  await c.query("update central_homologacao.warehouse_items set status='Enviado',version=version+1 where id=any($1::uuid[])",[rows.map(r=>r.id)]);
  await c.query('insert into central_homologacao.warehouse_movements(id,user_id,branch_id,destination,note,items) values($1,$2,$3,$4,$5,$6)',[id,user.user_id,branch,body.destination.trim(),body.note,JSON.stringify(rows.map(r=>({id:r.id,serial:r.serial,kind:r.kind})))]);
  return {id,response:{ok:true,id,count:rows.length}};
 }
 throw failure(405,'Método não permitido.');
}
