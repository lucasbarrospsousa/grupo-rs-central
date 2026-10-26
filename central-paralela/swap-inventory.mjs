import {swapSnapshot,swapState,plateKey} from './swap-rules.mjs';
import {value} from './integrations.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export async function swapInventory({action,input,user,doc,row,service}){
 const data=doc.data,branch=input.branch;
 if(!user.permissions?.owner&&!user.permissions?.writes?.includes('stock'))fail(403,'Sem permissão de troca.');
 const response=op=>({operation:{id:op.id,state:op.state,message:op.message,snapshot:op.snapshot},rows:data.rows.filter(r=>!r.deleted_at&&[op.snapshot.incoming.serial,op.snapshot.outgoing.serial].includes(r.serial))});
 if(action==='swap-preview'){
  const pending=data.operations.find(o=>o.kind==='swap'&&!['preview','complete','cancelled'].includes(o.state));if(pending){if(pending.serial!==row.serial)fail(409,'Há uma troca pendente para outro aparelho nesta filial. Confira antes de iniciar outra.');return {...response(pending),partial:pending.partial===true};}
  if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plateKey(input.plate)))fail(400,'Informe a placa de destino válida.');
  const snapshot=await swapSnapshot(service,branch,row.serial,input.plate);
  for(const serial of [snapshot.incoming.serial,snapshot.outgoing.serial])if(data.rows.filter(r=>!r.deleted_at&&r.serial===serial).length!==1)fail(409,'Os dois aparelhos precisam estar cadastrados nesta filial do Drive.');
  const op={id:crypto.randomUUID(),kind:'swap',serial:row.serial,state:'preview',snapshot,actor:user.username,created_at:new Date().toISOString(),message:'Conferência pronta. Aguarda confirmação.'};data.operations.push(op);await doc.save();return response(op);
 }
 const op=data.operations.find(o=>o.id===input.operation&&o.kind==='swap'&&o.serial===row.serial);if(!op)fail(404,'Troca não encontrada para este aparelho.');
 if(op.state==='complete')return response(op);
 if(!['swap-execute','swap-check'].includes(action))fail(400,'Ação inválida.');
 const read=()=>Promise.all([service.swapEquipment(branch,op.snapshot.incoming.serial),service.swapEquipment(branch,op.snapshot.outgoing.serial)]);
 const persist=async(state,message)=>{op.state=state;op.message=message;op.updated_at=new Date().toISOString();await doc.save();};
 if(action==='swap-execute'&&op.state==='preview'){
  if(input.confirmed!==true)fail(400,'Confirme a troca.');
  if(Date.now()-Date.parse(op.created_at)>60000)fail(409,'Conferência venceu. Consulte a placa novamente.');
  if(data.operations.some(o=>o.id!==op.id&&o.kind==='swap'&&!['preview','complete','cancelled'].includes(o.state)))fail(409,'Há uma troca pendente nesta filial.');
  if(swapState(op.snapshot,...await read())!=='original')fail(409,'Vínculo mudou. Confira novamente.');
  await persist('move_sent','Envio registrado. Aguardando conferência.');
  try{await service.swapAssociate(branch,op.snapshot.outgoing.vehicle_id,op.snapshot.incoming.id,true);}catch{/* Never repeat an uncertain write. */}
 }
 let state=swapState(op.snapshot,...await read());
 if(state==='partial'&&action==='swap-execute'&&op.state==='move_sent'){
  if(input.confirmed!==true)fail(400,'Confirme o retorno do aparelho retirado.');
  const source=await service.api(branch,'/veiculos/'+op.snapshot.incoming.vehicle_id+'/comunicacao');
  if(value(source.veiculo,['codVeiculo'])!==op.snapshot.incoming.vehicle_id||plateKey(value(source.veiculo,['placa']))!==plateKey(op.snapshot.incoming.plate)||!Object.hasOwn(source,'equipamento')||(source.equipamento!==null&&value(source.equipamento,['codEquipamento'])!=='0'))fail(409,'Origem não está livre. Troca parcial preservada para conferência.');
  await persist('return_sent','Retorno registrado. Aguardando conferência.');
  try{await service.swapAssociate(branch,op.snapshot.incoming.vehicle_id,op.snapshot.outgoing.id,false);}catch{/* Read-only reconciliation below. */}
  state=swapState(op.snapshot,...await read());
 }
 if(state==='complete'){
  const now=new Date().toISOString();
  for(const [device,vehicle,status] of [[op.snapshot.incoming,op.snapshot.outgoing,'Instalado'],[op.snapshot.outgoing,op.snapshot.incoming,'Manutenção']]){
   const target=data.rows.find(r=>!r.deleted_at&&r.serial===device.serial);if(!target)fail(409,'Cadastro local mudou. Conferência pendente.');
   Object.assign(target,{plate:status==='Instalado'?vehicle.plate:'',identification:status==='Manutenção'?vehicle.plate:'',status,owner_binding:null,live:null,api_codes:{branch,serial:device.serial,equipment_id:device.id,vehicle_id:vehicle.vehicle_id},version:Number(target.version||1)+1,updated_at:now,swap_id:op.id});
  }
  data.audit.push({action:'swap',actor:user.username,at:now,operation:op.id,snapshot:op.snapshot});
  await persist('complete','Troca concluída. Aparelho retirado registrado em Reparo.');
 }else{op.partial=state==='partial';op.message=state==='partial'?'Troca parcial. Confira e confirme o retorno do aparelho retirado.':'Resultado ainda não confirmado. Conferir não repete o envio.';await doc.save();}
 return {...response(op),partial:op.partial===true};
}
