import {rows,value,normalize} from './integrations.mjs';
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
