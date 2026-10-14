import {randomUUID} from 'node:crypto';
export function pendingChips(items){
 return [...new Map(items.filter(r=>String(r.status||'').trim().toUpperCase()==='PENDENTE'&&r.active!==true&&/^89\d{17,18}$/.test(String(r.iccid))).map(r=>[r.iccid,{id:randomUUID(),serial:r.iccid,operator:r.operator||'',phone:r.phone||''}])).values()];
}
// Saved provider inventory only; no activation or per-chip requests.
export async function importPendingChips(c){
 await c.query("select pg_advisory_xact_lock(hashtext('warehouse-pending'))");
 const source=(await c.query("select items,checked_at,last_error from central_homologacao.chip_cost_snapshots where provider='arya'")).rows[0];
 if(!source?.checked_at||source.last_error)throw Object.assign(Error('Não foi possível confirmar os pendentes da Árya. Tente atualizar novamente.'),{status:409});
 const items=pendingChips(source.items);
 const inserted=(await c.query(`insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,classification,received_at,chip_provider,chip_operator,chip_phone)
 select x.id,'imperatriz','chip',x.serial,'Disponível','Reserva',now(),'arya',x.operator,x.phone
 from jsonb_to_recordset($1::jsonb) as x(id uuid,serial text,operator text,phone text)
 where not exists(select 1 from central_homologacao.devices d where d.deleted_at is null and d.data->>'iccid'=x.serial)
 on conflict(kind,serial) do nothing returning id`,[JSON.stringify(items)])).rows;
 return {ok:true,count:inserted.length,ids:inserted.map(r=>r.id),pending:items.length,preserved:items.length-inserted.length,checked_at:source.checked_at};
}
