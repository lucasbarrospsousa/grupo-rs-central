import {randomUUID} from 'node:crypto';
const failure=(status,message)=>Object.assign(Error(message),{status});
export async function businessMutation(c,{path,method,body,branch,user,role}){
 const id=randomUUID();
 if(path==='/api/maintenance'&&method==='POST'){
  if(!['Sem comunicação','Localização errada','Troca de aparelho'].includes(body.reason)||typeof body.medium!=='string'||body.medium.length>100||typeof body.notes!=='string'||body.notes.length>2000)throw failure(400,'Dados do atendimento inválidos.');
  if(body.replacement)throw failure(422,'A troca exige validação da plataforma. Registre o atendimento sem aplicar a troca por enquanto.');
  const row=(await c.query('select id,serial,data from central_homologacao.devices where id=$1 and branch_id=$2 and deleted_at is null',[body.vehicle,branch])).rows[0];
  if(!row)throw failure(404,'Aparelho não encontrado nesta filial.');
  await c.query('insert into central_homologacao.visits(id,branch_id,device_id,data) values($1,$2,$3,$4)',[id,branch,row.id,{status:'Em análise',client:row.data.client||'',plate:row.data.plate||'',currentSerial:row.serial,reason:body.reason,medium:body.medium,notes:body.notes,entry:new Date().toISOString()}]);
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
  if(body.kind!=='device')throw failure(422,'Chip exige validação oficial da Arya, ainda indisponível.');
  if(!/^\d{9}$/.test(body.serial||''))throw failure(400,'Informe a série com nove dígitos.');
  await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,$2,'device',$3,'Disponível',now())",[id,branch,body.serial]);
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
