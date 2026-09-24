import {randomUUID} from 'node:crypto';
const fail=message=>Object.assign(Error(message),{status:409});
// Run in the caller's transaction after the device write has been confirmed.
export async function consumeConfiguredChip(c,{branch,serial,iccid,userId}){
 const item=(await c.query("select id,branch_id,status,version from central_homologacao.warehouse_items where kind='chip' and serial=$1 and deleted_at is null for update",[iccid])).rows[0];
 if(!item)return {found:false,changed:false}; // A chip may legitimately come from outside the warehouse.
 if(item.branch_id!==branch)throw fail('Chip pertence ao armazém de outra filial. Confira a transferência.');
 const devices=(await c.query("select serial,branch_id from central_homologacao.devices where data->>'iccid'=$1 and deleted_at is null",[iccid])).rows;
 if(devices.length!==1||devices[0].serial!==serial||devices[0].branch_id!==branch)throw fail('Uso do chip não confirmado em um único aparelho da filial.');
 if(item.status==='Utilizado')return {found:true,changed:false,status:'Utilizado'};
 if(item.status!=='Disponível')throw fail('Chip já foi movimentado. Confira o destino antes de utilizar.');
 const movementId=randomUUID();
 await c.query("update central_homologacao.warehouse_items set status='Utilizado',version=version+1 where id=$1",[item.id]);
 await c.query('insert into central_homologacao.warehouse_movements(id,user_id,branch_id,destination,note,items) values($1,$2,$3,$4,$5,$6)',[movementId,userId,branch,`${branch} • Aparelho ${serial}`,'Uso confirmado pelo Configurador RS300',JSON.stringify([{id:item.id,serial:iccid,kind:'chip',action:'Utilizado',device_serial:serial}])]);
 await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,userId,'CONFIGURATOR_CHIP_USED',item.id,{movementId,serial,previousVersion:item.version}]);
 return {found:true,changed:true,status:'Utilizado',movementId};
}
