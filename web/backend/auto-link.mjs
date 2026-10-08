import {randomUUID} from 'node:crypto';
import {scoped} from './remote-actions.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function linkPrefix(data){
 const version=String(data.tracker_version||data.model||'').trim().replace(/^V/i,'');
 const prefix={'7.3.2':'GRS','7.3.5':'XRS','7.2.2':'AAA','7.1.6':'AAA','7.2.2/7.1.6':'AAA'}[version];
 if(!prefix)throw fail(422,'Tipo do aparelho não confirmado. Configure e salve a versão antes de vincular.');return prefix;
}
export function linkOutcome({status,body},equipmentId,vehicleId){
 let data;try{data=JSON.parse(body);}catch{return 'uncertain';}
 const message=String(data.message||data.mensagem||data.error?.message||data.error||data.erro||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 // Only an explicit occupied target allows advancing. Generic duplicates/409 never do.
 if([400,409,422].includes(status)&&/(veiculo|placa|identificacao).*(ja possui|ja tem|ja esta vinculad).*(outro equipamento|outro aparelho|um equipamento)/.test(message))return 'occupied';
 if(status>=200&&status<300&&data.ok===true&&!data.error&&!data.erro&&data.success!==false){
  if(data.codEquipamento!=null&&String(data.codEquipamento)!==String(equipmentId))return 'uncertain';
  if(data.codVeiculo!=null&&String(data.codVeiculo)!==String(vehicleId))return 'uncertain';
  return 'confirmed';
 }
 return 'uncertain';
}
export async function importLinkLot({pool,user,branch,body,service}){
 const {prefix,start,end}=body;
 if(!['GRS','AAA','XRS'].includes(prefix)||!Number.isInteger(start)||!Number.isInteger(end)||start<450||end<start||end>999999||end-start>=1000)throw fail(400,'Informe prefixo e faixa de até 1.000 números, começando em 450 ou acima.');
 // One read when registering the lot, never before/after an individual association.
 const owner=await service.linkStockOwner(branch),targets=[];
 for(const v of owner.vehicles){const compact=String(v.plate||'').replace(/[\s-]/g,'').toUpperCase();const match=/^(GRS|AAA|XRS)(\d+)$/.exec(compact);if(!match||match[1]!==prefix)continue;const number=Number(match[2]);if(number<start||number>end)continue;
  if(!/^[1-9]\d*$/.test(v.vehicle_id)||Number(v.owner_count)>1)throw fail(422,'Lote contém identificação não confirmada.');
  targets.push({...v,number});
 }
 if(new Set(targets.map(v=>v.number)).size!==targets.length)throw fail(409,'Há identificações duplicadas na plataforma.');
 for(let number=start;number<=end;number++)if(!targets.some(v=>v.number===number))targets.push({number,plate:prefix+' - '+String(number).padStart(3,'0'),vehicle_id:null});
 return scoped(pool,user,async c=>{for(const v of targets)await c.query("insert into central_homologacao.link_targets(branch_id,prefix,number,plate,vehicle_id,client_id,state) values($1,$2,$3,$4,$5,$6,$7) on conflict(branch_id,prefix,number) do nothing",[branch,prefix,v.number,v.plate,v.vehicle_id,owner.id,v.equipment_id||v.serial?'occupied':'available']);
  await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'IMPORT_LINK_LOT',randomUUID(),{prefix,start,end,count:targets.length}]);
  return{ok:true,imported:targets.length,message:targets.length+' números cadastrados no lote. Identificações ausentes serão criadas ao vincular.'};});
}
export async function startAutoLink({pool,user,branch,body}){
 return scoped(pool,user,async c=>{
  const d=(await c.query('select * from central_homologacao.devices where id=$1 and branch_id=$2 and deleted_at is null for update',[body.id,branch])).rows[0];
  if(!d)throw fail(404,'Aparelho não encontrado.');
  const pending=(await c.query("select * from central_homologacao.remote_operations where branch_id=$1 and kind='link' and serial=$2 and state in ('prepared','submitted','pending') order by created_at desc limit 1",[branch,d.serial])).rows[0];
  if(pending)return {id:pending.id,existing:true,state:pending.state,message:pending.result?.message||'Vinculação já registrada. Acompanhe o progresso.'};
  const done=(await c.query("select id from central_homologacao.remote_operations where branch_id=$1 and serial=$2 and kind='link' and state='confirmed' and payload->>'automatic'='true' and result->>'plate'=$3 and (payload->>'version')::int+1=$4 order by created_at desc limit 1",[branch,d.serial,d.data.identification||'',d.version])).rows[0];if(done&&d.data.status==='Estoque')return{id:done.id,existing:true};
  if(d.version!==body.version||!['Estoque','Reserva','Manutenção'].includes(d.data.status))throw fail(409,'Cadastro mudou ou não está disponível para vinculação.');
  const prefix=linkPrefix(d.data),equipment=(await c.query('select central_homologacao.binding_device_code($1,$2) as code',[branch,d.serial])).rows[0]?.code;
  if(!/^[1-9]\d*$/.test(equipment||''))throw fail(422,'Código do aparelho ausente. Use Atualizar aparelhos antes de vincular.');
  const id=randomUUID();const target=(await c.query("select * from central_homologacao.link_targets where branch_id=$1 and prefix=$2 and state='available' order by number for update skip locked limit 1",[branch,prefix])).rows[0];
  if(!target)throw fail(422,'Nenhuma identificação livre neste lote. Abra Lotes de vinculação.');
  const payload={automatic:true,device_id:d.id,version:d.version,equipment_id:equipment,prefix,target,attempts:0};
  await c.query("insert into central_homologacao.remote_operations(id,user_id,branch_id,kind,serial,payload,state) values($1,$2,$3,'link',$4,$5,'submitted')",[id,user.user_id,branch,d.serial,payload]);
  await c.query("update central_homologacao.link_targets set state='reserved',operation_id=$4 where branch_id=$1 and prefix=$2 and number=$3",[branch,prefix,target.number,id]);
  return{id,existing:false,state:'submitted'};
 });
}
export async function runAutoLink(id,{pool,user,service,claim}){
 // Durable send fence: a lost response never results in another submission.
 for(let attempt=0;attempt<10;attempt++){
  const op=await scoped(pool,user,async c=>{const op=(await c.query('select * from central_homologacao.remote_operations where id=$1 for update',[id])).rows[0];if(!op?.payload.automatic||op.state!=='submitted'||op.payload.sent||(claim&&op.payload.claim!==claim))return null;const device=(await c.query('select version from central_homologacao.devices where id=$1 and deleted_at is null',[op.payload.device_id])).rows[0];if(device?.version!==op.payload.version){await c.query("update central_homologacao.remote_operations set state='pending',result=$2 where id=$1",[id,{message:'Cadastro mudou antes do envio. Confira a operação.'}]);return null;}op.payload.sent=true;op.payload.attempts=attempt+1;await c.query('update central_homologacao.remote_operations set payload=$2,updated_at=now() where id=$1',[id,op.payload]);return op;});
  if(!op)return;
  let outcome='uncertain',stage='create',failure=null;const interpret=response=>{const result=linkOutcome(response,op.payload.equipment_id,op.payload.target.vehicle_id);if(result==='uncertain')failure={status:response.status,reason:'invalid_response'};return result;};try{
   let target=op.payload.target;
   if(!target.vehicle_id){
    const created=await service.createSavedTarget(op.branch_id,op.payload.equipment_id,target);
    if(created.occupied)outcome='occupied';
    else if(created.vehicle_id){
     target={...target,vehicle_id:created.vehicle_id};op.payload.target=target;
     await scoped(pool,user,async c=>{await c.query("update central_homologacao.link_targets set vehicle_id=$2 where operation_id=$1 and state='reserved'",[id,target.vehicle_id]);await c.query("update central_homologacao.remote_operations set payload=jsonb_set(payload,'{target}',$2::jsonb) where id=$1",[id,JSON.stringify(target)]);});
     stage='link';outcome=interpret(await service.linkSaved(op.branch_id,op.payload.equipment_id,target.vehicle_id));
    }
   }else {stage='link';outcome=interpret(await service.linkSaved(op.branch_id,op.payload.equipment_id,target.vehicle_id));}
  }catch(e){failure={notSent:e.requestNotSent===true,status:Number(e.upstreamStatus||e.status)||null,reason:e.requestNotSent?'queue_busy':e.upstreamStatus?'http_error':'transport_error'};}
  const again=await scoped(pool,user,async c=>{
   const current=(await c.query('select * from central_homologacao.remote_operations where id=$1 for update',[id])).rows[0];if(current.state!=='submitted')return false;
   const p=current.payload,t=p.target;
   if(failure?.notSent){
    if(p.cancel_requested){await c.query("update central_homologacao.remote_operations set state='cancelled',result=$2,updated_at=now() where id=$1",[id,{message:'Vinculação cancelada antes do envio.'}]);await c.query("update central_homologacao.link_targets set state='available',operation_id=null where operation_id=$1 and state='reserved'",[id]);return false;}
    const next={...p,sent:false,retry_at:new Date(Date.now()+5000).toISOString()};delete next.running_at;delete next.claim;
    await c.query("update central_homologacao.remote_operations set payload=$2,result=$3,updated_at=now() where id=$1",[id,next,{message:'Aguardando espaço na API. Envio não realizado; retomada automática.',stage,reason:'queue_busy'}]);return false;
   }
   if(outcome==='confirmed'){
    const r=await c.query("update central_homologacao.devices set data=data||$4::jsonb,version=version+1,updated_at=now() where id=$1 and branch_id=$2 and version=$3 and deleted_at is null returning id",[p.device_id,op.branch_id,p.version,JSON.stringify({status:'Estoque',identification:t.plate,plate:'',client:'RS300',installed_at:'',quantity:1,stock:1})]);
    if(r.rowCount)await c.query('select central_homologacao.capture_device_codes($1,$2,$3)',[op.branch_id,op.serial,{state:'confirmed',equipment_id:p.equipment_id,vehicle_id:t.vehicle_id,api_plate:t.plate}]);
    await c.query("update central_homologacao.link_targets set state='confirmed' where operation_id=$1",[id]);
    const state=r.rowCount?'confirmed':'pending',message=r.rowCount?'Vínculo confirmado e estoque atualizado: '+t.plate:'API confirmou o vínculo, mas o cadastro local mudou. Conferência necessária.';
    await c.query('update central_homologacao.remote_operations set state=$2,result=$3,updated_at=now() where id=$1',[id,state,{message,remoteConfirmed:true,plate:t.plate}]);
    await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[op.branch_id,user.user_id,'AUTO_LINK_CONFIRMED',id,{device:p.device_id,plate:t.plate,localSaved:!!r.rowCount}]);return false;
   }
   if(outcome==='occupied'){
    await c.query("update central_homologacao.link_targets set state='occupied' where operation_id=$1 and state='reserved'",[id]);
    if(p.cancel_requested){await c.query("update central_homologacao.remote_operations set state='cancelled',result=$2,updated_at=now() where id=$1",[id,{message:'Placa ocupada. Próximas tentativas canceladas.'}]);return false;}
    const next=attempt<9?(await c.query("select * from central_homologacao.link_targets where branch_id=$1 and prefix=$2 and number>$3 and state='available' order by number for update skip locked limit 1",[op.branch_id,p.prefix,t.number])).rows[0]:null;
    if(next){await c.query("update central_homologacao.link_targets set state='reserved',operation_id=$4 where branch_id=$1 and prefix=$2 and number=$3",[op.branch_id,p.prefix,next.number,id]);await c.query('update central_homologacao.remote_operations set payload=$2,updated_at=now() where id=$1',[id,{...p,target:next,sent:false}]);return true;}
    await c.query("update central_homologacao.remote_operations set state='failed',result=$2,updated_at=now() where id=$1",[id,{message:'Lote esgotado ou limite de dez tentativas atingido.'}]);return false;
   }
   const detail=failure?.status?'HTTP '+failure.status:failure?'Falha de comunicação':'Resposta não confirmou a operação';
   await c.query("update central_homologacao.remote_operations set state='pending',result=$2,updated_at=now() where id=$1",[id,{message:detail+' ao '+(stage==='create'?'criar a identificação':'vincular o aparelho')+'. Número reservado; confira antes de reenviar.',stage,reason:failure?.reason||'invalid_response',http_status:failure?.status||null}]);return false;
  });
  if(!again)return;
 }
}
