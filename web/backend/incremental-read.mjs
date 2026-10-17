// Existing authenticated routes retain membership/module checks and RLS.
export function parseCursor(v){if(v==null||v==='')return null;if(!/^(0|[1-9][0-9]{0,18})$/.test(v)||BigInt(v)>9223372036854775807n)throw Object.assign(Error('Marcador de atualização inválido.'),{status:400});return v;}
export async function readPlan(c,branch,kinds,since){
 since=parseCursor(since);
 const r=(await c.query(`select revision::text as cursor,coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',entity_id)) from (select kind,entity_id from central_homologacao.read_changes where branch_id=$1 and kind=any($2::text[]) and revision>$3::bigint limit 2001) changed),'[]') as changes from central_homologacao.read_clock where id`,[branch,kinds,since||'9223372036854775807'])).rows[0];
 const delta=since!==null&&BigInt(since)<=BigInt(r.cursor)&&r.changes.length<=2000;
 return {cursor:r.cursor,delta,changes:delta?r.changes:[],ids:delta?r.changes.filter(x=>x.kind===kinds[0]).map(x=>x.id):null};
}
export async function incrementalRead(c,branch,group,since){
 const p=await readPlan(c,branch,group==='devices'?['devices']:['warehouse','movements'],since);
 if(p.delta&&!p.changes.length)return {cursor:p.cursor,delta:true,unchanged:true};
 if(group==='devices'){
  const rows=(await c.query(`select d.id,d.serial,d.data,d.version,o.data as observation,o.checked_at from central_homologacao.devices d left join central_homologacao.device_observations o on o.device_id=d.id where d.branch_id=$1 and d.deleted_at is null and ($2::uuid[] is null or d.id=any($2::uuid[])) order by d.serial`,[branch,p.ids])).rows.map(r=>({...r.data,id:r.id,serial:r.serial,branch,version:r.version,observation:r.observation,checked_at:r.checked_at}));
  return {cursor:p.cursor,delta:p.delta,rows,removed:p.delta?p.ids.filter(id=>!rows.some(r=>r.id===id)):[]};
 }
 const rows=(await c.query(`select w.id,w.branch_id as branch,w.kind,w.serial,w.status,w.classification,w.received_at,w.version,w.activation_batch,w.activation_state,w.activation_at,w.activation_reference,w.chip_provider,w.chip_operator,w.chip_phone,w.usage_device_serial,w.usage_branch,w.usage_detected_at,(select d.data->>'iccid' from central_homologacao.devices d where d.serial=w.usage_device_serial and d.branch_id=w.usage_branch and d.deleted_at is null limit 1) as linked_iccid from central_homologacao.warehouse_items w where w.branch_id=$1 and w.deleted_at is null and ($2::uuid[] is null or w.id=any($2::uuid[])) order by w.received_at desc`,[branch,p.ids])).rows;
 const ids=p.delta?p.changes.filter(x=>x.kind==='movements').map(x=>x.id):null;
 const movements=(await c.query(`select id,branch_id as branch,destination,note,created_at,items from central_homologacao.warehouse_movements where branch_id=$1 and ($2::uuid[] is null or id=any($2::uuid[])) order by created_at desc`,[branch,ids])).rows;
 return {cursor:p.cursor,delta:p.delta,rows,movements,removed:p.delta?p.ids.filter(id=>!rows.some(r=>r.id===id)):[],removedMovements:ids?.filter(id=>!movements.some(m=>m.id===id))||[]};
}
