// Read-only: called inside the authenticated devices transaction (RLS).
export const ownerValidSql = `d.data->>'status'='Instalado'
 and d.data#>>'{owner_binding,branch}'=d.branch_id
 and d.data#>>'{owner_binding,serial}'=d.serial
 and coalesce(d.data#>>'{owner_binding,client}','')<>''
 and d.data#>>'{owner_binding,client_id}'~'^[1-9][0-9]*$'
 and pg_input_is_valid(d.data#>>'{owner_binding,checked_at}','timestamp with time zone')
 and coalesce(d.data->>'plate','')<>''
 and regexp_replace(upper(d.data#>>'{owner_binding,plate}'),'[^A-Z0-9]','','g')=regexp_replace(upper(d.data->>'plate'),'[^A-Z0-9]','','g')
 and exists(select 1 from central_homologacao.device_codes c where c.device_id=d.id and c.serial=d.serial and c.equipment_id::text=d.data#>>'{owner_binding,equipment_id}' and c.vehicle_id::text=d.data#>>'{owner_binding,vehicle_id}')
 and not exists(select 1 from central_homologacao.equipment_swaps s where s.branch_id=d.branch_id and s.phase in ('move_sent','return_sent') and d.serial in (s.snapshot->'incoming'->>'serial',s.snapshot->'outgoing'->>'serial'))`;
export async function savedOwners(c,branch,q){
 q=String(q||'').trim();if(q.length<3||q.length>120)throw Object.assign(Error('Informe entre 3 e 120 caracteres.'),{status:400});
 const fold=x=>`lower(regexp_replace(normalize(coalesce(${x},''),NFD),'[̀-ͯ]','','g'))`;
 const result=await c.query(`select d.data->'owner_binding' as owner, coalesce((${ownerValidSql}),false) as valid
 from central_homologacao.devices d where d.branch_id=$1 and d.deleted_at is null and d.data->>'status'='Instalado'
 and (strpos(${fold("d.data#>>'{owner_binding,client}'")},${fold('$2')})>0 or strpos(${fold("d.data->>'client'")},${fold('$2')})>0) order by d.serial`,[branch,q]);
 const groups=new Map();let pending=0;const normalized=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 for(const r of result.rows){if(!r.valid){pending++;continue;}const o=r.owner;let g=groups.get(o.client_id);if(!g){g={id:o.client_id,name:o.client,bindings:[]};groups.set(o.client_id,g);}if(g.name!==o.client){g.ambiguous=true;}g.bindings.push(o);}
 const rows=[];for(const g of groups.values()){if(g.ambiguous){pending+=g.bindings.length;continue;}if(normalized(g.name).includes(normalized(q)))rows.push(g);}return {rows,pending,source:'saved'};
}
