const compact=v=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const numeric=v=>/^[1-9]\d*$/.test(String(v||''));
export function confirmedOwner(branch,serial,equipment,vehicle){
 if(!equipment?.ok||equipment.serial!==serial||!numeric(equipment.id)||!numeric(equipment.vehicle_id)||!vehicle||vehicle.serial!==serial||String(vehicle.vehicle_id)!==String(equipment.vehicle_id)||!compact(vehicle.plate)||compact(vehicle.plate)!==compact(equipment.plate)||(vehicle.equipment_id&&String(vehicle.equipment_id)!==String(equipment.id))||!numeric(vehicle.client_id)||!vehicle.client||Number(vehicle.owner_count)>1)return null;
 return {branch,serial,equipment_id:String(equipment.id),vehicle_id:String(vehicle.vehicle_id),plate:vehicle.plate,client_id:String(vehicle.client_id),client:vehicle.client,checked_at:new Date().toISOString()};
}
export async function stockOwner(pool,service,branch,serial,{equipment,fresh=false}={}){
 const context=(await pool.query('select central_homologacao.owner_context($1,$2) as data',[branch,serial])).rows[0]?.data;
 if(!context)return {ok:false,message:'Titular não confirmado'};
 const cached=context.owner;
 if(!fresh&&cached&&cached.branch===branch&&cached.serial===serial&&String(cached.vehicle_id)===String(context.vehicle_id)&&String(cached.equipment_id)===String(context.equipment_id)&&compact(cached.plate)===compact(context.plate)&&Date.now()-Date.parse(cached.checked_at)<6*3600000)return {ok:true,...cached,cached:true};
 let owner=null,message='Titular não confirmado';
 try{
  equipment=equipment||await service.equipment(branch,serial);
  const rows=await service.vehicles(branch,serial,{equipment});let vehicle=rows.length===1?rows[0]:null;
  if(vehicle&&!vehicle.client&&Number(vehicle.owner_count)<=1&&context.hint){const found=await service.associationOwner(branch,vehicle,context.hint,{fresh:false});if(found)vehicle={...vehicle,...found};}
  owner=confirmedOwner(branch,serial,equipment,vehicle);
 }catch(e){if(e.automaticDeferred)throw e;return {ok:false,message:'Titular não confirmado • consulta pendente'};}
 // Optimistic write: a swap or edit during the request must not receive the old owner.
 const saved=(await pool.query('select central_homologacao.owner_save($1,$2,$3,$4) as saved',[branch,serial,context.version,owner])).rows[0]?.saved;
 return owner&&saved?{ok:true,...owner}:{ok:false,message};
}
