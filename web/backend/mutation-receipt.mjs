// Only affected rows, read inside the same transaction as the mutation.
// The HTTP handler releases this receipt only after COMMIT succeeds.
import {scoped} from './remote-actions.mjs';
export async function mutationReceipt(c,{path,method,body,branch,result}){
 const changes={branch};
 if(path.startsWith('/api/devices')||path==='/api/bulk'||path==='/api/install'){
  const ids=path==='/api/install'?[body.id]:result.ids||[result.id];
  if(method==='DELETE')changes.removedDevices=[{id:result.id,version:result.version}];
  else changes.devices=(await c.query('select id,branch_id as branch,serial,data,version from central_homologacao.devices where branch_id=$1 and id=any($2::uuid[]) and deleted_at is null',[branch,ids])).rows.map(r=>({...r.data,id:r.id,branch:r.branch,serial:r.serial,version:r.version}));
  if(changes.devices?.length){
   const serials=changes.devices.flatMap(r=>[r.serial,r.iccid].filter(Boolean));
   const related=(await c.query(`select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('branch',w.branch_id)),'[]') as rows,
    (select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('branch',m.branch_id)),'[]') from central_homologacao.warehouse_movements m where m.branch_id='imperatriz' and m.created_at>=transaction_timestamp() and exists(select 1 from jsonb_array_elements(m.items) item where item->>'serial'=any($1::text[]))) as movements
    from central_homologacao.warehouse_items w where w.branch_id='imperatriz' and w.serial=any($1::text[]) and w.deleted_at is null`,[serials])).rows[0];
   if(related?.rows.length)changes.relatedWarehouse={branch:'imperatriz',warehouse:related.rows,movements:related.movements};
  }
 }else if(path.startsWith('/api/maintenance')){
  changes.reports=(await c.query('select id,branch_id as branch,data,version from central_homologacao.visits where branch_id=$1 and id=$2',[branch,result.id])).rows.map(r=>({...r.data,id:r.id,branch:r.branch,version:r.version,editable:true}));
 }else if(path.startsWith('/api/warehouse')){
  if(method==='DELETE')changes.removedWarehouse=[{id:result.id,version:body.version+1}];
  else {
   const batch=path.startsWith('/api/warehouse-activation')?(body.batch||result.id):null;
   const ids=path==='/api/warehouse-transfer'?body.items.map(r=>r.id):[result.id].filter(Boolean);
   changes.warehouse=(await c.query('select w.*,w.branch_id as branch from central_homologacao.warehouse_items w where branch_id=$1 and deleted_at is null and (id=any($2::uuid[]) or ($3::uuid is not null and activation_batch=$3))',[branch,ids,batch])).rows;
   if(path==='/api/warehouse-transfer')changes.movements=(await c.query('select id,branch_id as branch,destination,note,created_at,items from central_homologacao.warehouse_movements where branch_id=$1 and id=$2',[branch,result.id])).rows;
  }
 }
 return {...result,changes};
}

// Remote confirmation remains authoritative. Read only its affected local rows;
// failure to obtain the display receipt must never resubmit an external action.
export async function remoteMutationReceipt(pool,user,branch,kind,result){
 if(result.ok!==true||!result.id)return result;
 try{return await scoped(pool,user,async c=>{
  const predicate=kind==='swap'?"serial in (select snapshot->'incoming'->>'serial' from central_homologacao.equipment_swaps where id=$2 and branch_id=$1 union all select snapshot->'outgoing'->>'serial' from central_homologacao.equipment_swaps where id=$2 and branch_id=$1)":"id in (select (payload->>'device_id')::uuid from central_homologacao.remote_operations where id=$2 and branch_id=$1 and kind='link')";
  const rows=(await c.query(`select id,branch_id as branch,serial,data,version from central_homologacao.devices where branch_id=$1 and deleted_at is null and ${predicate}`,[branch,result.id])).rows;
  return {...result,changes:{branch,devices:rows.map(r=>({...r.data,id:r.id,branch:r.branch,serial:r.serial,version:r.version}))}};
 });}catch{return {...result,refreshPending:true};}
}
