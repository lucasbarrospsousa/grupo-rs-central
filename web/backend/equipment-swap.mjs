import {randomUUID} from 'node:crypto';
import {rows,value,normalize} from './integrations.mjs';
import {scoped} from './remote-actions.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export const plateKey=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const validId=v=>/^[1-9]\d*$/.test(String(v||''));
export async function swapSnapshot(service,branch,serial,plate){
 if(!/^\d{6,17}$/.test(serial)||!plateKey(plate)||String(plate).length>30)throw fail(400,'Informe uma placa válida.');
 const [a,list]=await Promise.all([service.swapEquipment(branch,serial),service.api(branch,'/veiculos?q='+encodeURIComponent(plate)+'&take=50&skip=0')]);
 const matches=rows(list).filter(r=>plateKey(value(r,['placa']))===plateKey(plate));
 if(list.paginacao?.temMais||matches.length!==1)throw fail(422,'Placa única não confirmada nesta base.');
 const target=normalize(matches[0]);
 if(!validId(target.vehicle_id)||!validId(a.id)||!validId(a.vehicle_id)||!a.plate||a.vehicle_id===target.vehicle_id)throw fail(422,'Origem e destino distintos precisam ter vínculos confirmados.');
 const detail=await service.api(branch,'/veiculos/'+target.vehicle_id+'/comunicacao'),v=detail.veiculo;
 if(!v||value(v,['codVeiculo'])!==target.vehicle_id||plateKey(value(v,['placa']))!==plateKey(plate))throw fail(409,'A placa mudou. Digite novamente.');
 const equipmentId=value(detail.equipamento,['codEquipamento'])||value(v,['codEquipamento'])||value(v.equipamento,['codEquipamento'])||target.equipment_id;
 if(!validId(equipmentId)||equipmentId===a.id)throw fail(422,'Aparelho atual do veículo não confirmado.');
 const old=await service.api(branch,'/equipamentos/'+equipmentId),raw=old.equipamento;
 const oldSerial=normalize(raw||{}).serial;
 if(!raw||value(raw,['codEquipamento'])!==equipmentId||!oldSerial||value(raw.veiculo,['codVeiculo'])!==target.vehicle_id||plateKey(value(raw.veiculo,['placa']))!==plateKey(plate))throw fail(409,'Vínculo do aparelho a retirar não confirmado.');
 return {incoming:{serial,id:a.id,vehicle_id:a.vehicle_id,plate:a.plate},outgoing:{serial:oldSerial,id:equipmentId,vehicle_id:target.vehicle_id,plate:value(v,['placa'])},client:target.client,model:value(v,['modelo'])};
}
export function sameSwap(a,b){return JSON.stringify([a.incoming,a.outgoing])===JSON.stringify([b.incoming,b.outgoing]);}
export function swapState(snapshot,a,b){
 const x=snapshot.incoming,y=snapshot.outgoing;
 if(a.id!==x.id||b.id!==y.id||a.serial!==x.serial||b.serial!==y.serial||!a.binding_known||!b.binding_known)return 'conflict';
 if(a.vehicle_id===y.vehicle_id&&plateKey(a.plate)===plateKey(y.plate)){
  if(b.vehicle_id===x.vehicle_id&&plateKey(b.plate)===plateKey(x.plate))return 'complete';
  if(!b.vehicle_id&&!b.plate)return 'partial';
 }
 if(a.vehicle_id===x.vehicle_id&&b.vehicle_id===y.vehicle_id&&plateKey(a.plate)===plateKey(x.plate)&&plateKey(b.plate)===plateKey(y.plate))return 'original';
 return 'conflict';
}
export async function equipmentSwap({pool,user,branch,service,action,body={}}){
 const tx=fn=>scoped(pool,user,fn);
 const read=id=>tx(async c=>(await c.query('select * from central_homologacao.equipment_swaps where id=$1 and branch_id=$2',[id,branch])).rows[0]);
 if(action==='status')return tx(async c=>({operation:(await c.query("select id,phase,result,snapshot from central_homologacao.equipment_swaps where branch_id=$1 and phase not in ('preview','complete','cancelled') and (snapshot->'incoming'->>'serial'=$2 or snapshot->'outgoing'->>'serial'=$2) order by created_at desc limit 1",[branch,body.serial])).rows[0]||null}));
 if(action==='preview'){
  const snapshot=await swapSnapshot(service,branch,body.serial,body.plate),id=randomUUID();
  await tx(c=>c.query("insert into central_homologacao.equipment_swaps(id,branch_id,user_id,snapshot,phase) values($1,$2,$3,$4,'preview')",[id,branch,user.user_id,snapshot]));
  return {id,snapshot};
 }
 if(!/^[a-f0-9-]{36}$/.test(body.id||''))throw fail(400,'Operação inválida.');
 let op=await read(body.id);if(!op)throw fail(404,'Troca não encontrada.');
 if(op.phase==='complete')return {id:op.id,ok:true,message:'Troca concluída.'};
 if(op.phase==='cancelled')throw fail(409,'Conferência vencida. Digite a placa novamente.');
 const snapshot=op.snapshot;
 if(op.phase==='preview'){
  if(Date.now()-new Date(op.created_at).getTime()>60000)throw fail(409,'Conferência vencida. Digite a placa novamente.');
  // Revalidate identities before the durable send fence. No writes on a stale preview.
  const [incoming,outgoing]=await Promise.all([service.swapEquipment(branch,snapshot.incoming.serial),service.swapEquipment(branch,snapshot.outgoing.serial)]);
  if(swapState(snapshot,incoming,outgoing)!=='original')throw fail(409,'Vínculo mudou. Digite a placa novamente.');
  try{const claim=await tx(c=>c.query("update central_homologacao.equipment_swaps set phase='move_sent',updated_at=now() where id=$1 and phase='preview' returning id",[op.id]));
   if(claim.rowCount){try{await service.swapAssociate(branch,snapshot.outgoing.vehicle_id,snapshot.incoming.id,true);}catch(e){await tx(c=>c.query('update central_homologacao.equipment_swaps set result=$2 where id=$1',[op.id,{message:'Resposta não confirmada; conferindo sem reenviar.',status:e.upstreamStatus||e.status}]));}}
  }catch(e){if(e.code==='23505')throw fail(409,'Há outra troca pendente nesta base. Conclua sua conferência antes.');throw e;}
 }
 op=await read(op.id);
 // A recently sent operation may still be running in another request. Only its owner
 // reaches this point immediately; reads below are harmless and phase CAS fences writes.
 const [a,b]=await Promise.all([service.swapEquipment(branch,snapshot.incoming.serial),service.swapEquipment(branch,snapshot.outgoing.serial)]);
 let state=swapState(snapshot,a,b);
 if(state==='partial'&&op.phase==='move_sent'){
  const source=await service.api(branch,'/veiculos/'+snapshot.incoming.vehicle_id+'/comunicacao'),v=source.veiculo;
  if(!v||value(v,['codVeiculo'])!==snapshot.incoming.vehicle_id||plateKey(value(v,['placa']))!==plateKey(snapshot.incoming.plate)||!Object.hasOwn(source,'equipamento')||(source.equipamento!==null&&value(source.equipamento,['codEquipamento'])!=='0'))throw fail(409,'Troca parcial: origem não está livre. Confira o vínculo.');
  const claim=await tx(c=>c.query("update central_homologacao.equipment_swaps set phase='return_sent',updated_at=now() where id=$1 and phase='move_sent' returning id",[op.id]));
  if(claim.rowCount){try{await service.swapAssociate(branch,snapshot.incoming.vehicle_id,snapshot.outgoing.id,false);}catch{/* Read-only reconciliation after uncertain writes. */}}
  const [afterA,afterB]=await Promise.all([service.swapEquipment(branch,snapshot.incoming.serial),service.swapEquipment(branch,snapshot.outgoing.serial)]);state=swapState(snapshot,afterA,afterB);
 }
 if(state==='complete'){
  await tx(async c=>{
   const locked=(await c.query('select phase from central_homologacao.equipment_swaps where id=$1 for update',[op.id])).rows[0];if(locked.phase==='complete')return;
   for(const [device,vehicle,status] of [[snapshot.incoming,snapshot.outgoing,'Instalado'],[snapshot.outgoing,snapshot.incoming,'Manutenção']]){
    const patch={plate:status==='Instalado'?vehicle.plate:'',identification:status==='Manutenção'?vehicle.plate:'',status,client:status==='Instalado'?snapshot.client:'',binding_checked_at:new Date().toISOString(),swap_id:op.id};
    await c.query("update central_homologacao.devices set data=data||$3::jsonb,version=version+1,updated_at=now() where branch_id=$1 and serial=$2 and deleted_at is null",[branch,device.serial,patch]);
    await c.query('select central_homologacao.capture_device_codes($1,$2,$3)',[branch,device.serial,{state:'confirmed',equipment_id:device.id,vehicle_id:vehicle.vehicle_id,api_plate:vehicle.plate}]);
   }
   await c.query("update central_homologacao.equipment_swaps set phase='complete',updated_at=now(),result=$2 where id=$1",[op.id,{message:'Troca concluída.'}]);
   await c.query("insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,'EQUIPMENT_SWAP',$3,$4)",[branch,user.user_id,op.id,snapshot]);
  });
  return {ok:true,id:op.id,message:'Troca concluída. Aparelho retirado em Manutenção.'};
 }
 if(state==='original'&&[400,401,403,404,409,422,429].includes(op.result?.status)){await tx(c=>c.query("update central_homologacao.equipment_swaps set phase='cancelled',updated_at=now() where id=$1",[op.id]));throw fail(409,'Troca recusada pela API; vínculos preservados. Confira a placa novamente.');}
 const message=state==='partial'?'Troca parcial: falta confirmar o vínculo do aparelho retirado.':'Vínculos ainda não confirmados. Conferir novamente não repete o envio.';
 await tx(c=>c.query('update central_homologacao.equipment_swaps set result=$2 where id=$1',[op.id,{message,state}]));
 return {ok:false,pending:true,id:op.id,message};
}
