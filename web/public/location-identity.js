const key=value=>String(value||'').replace(/[\s-]/g,'').toUpperCase();
export function confirmedIdentity(location,identity,serial){
 if(!identity?.ok||identity.skipped)return null;
 if(identity.serial!==serial||!location?.ok||!location.vehicle_id||String(location.vehicle_id)!==String(identity.vehicle_id)||!identity.client||location.plate&&key(location.plate)!==key(identity.plate))throw Error('O vínculo da API e da web não coincide. Titular não confirmado.');
 return {client:identity.client,plate:identity.plate,serial,vehicle_id:identity.vehicle_id};
}
