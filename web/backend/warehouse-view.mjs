import {sqlWarehouseAggregate} from './warehouse-aggregate.mjs';
import {reserveChip,activationCandidate} from '../public/warehouse-activation-model.js';
import {incrementalRead,readPlan} from './incremental-read.mjs';
import {overviewData} from '../public/warehouse-overview-model.js';
import {monthlyShipments} from '../public/warehouse-monthly.js';
import {filterWarehouseMovements} from '../public/warehouse-movements-model.js';
import {warehouseDestination} from '../public/warehouse-model.js';
import {carrierSummary} from '../public/dashboard-model.js';
export function warehouseRows(data){
 const rows=data.rows.map(r=>({...r,received:new Date(r.received_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}));
 const movements=data.movements.flatMap(m=>m.items.map(item=>({id:m.id,branch:m.branch,type:item.action||'Envio',kind:item.kind,serial:item.serial,deviceSerial:item.device_serial||'',phone:item.phone||'',note:m.note||'',detected:item.time_basis==='detection',atISO:item.detected_at||m.created_at,at:new Date(item.detected_at||m.created_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}),destination:m.destination})));
 const moved=new Set(movements.map(m=>m.serial));
 movements.push(...rows.filter(r=>['Utilizado','Enviado'].includes(r.status)&&!moved.has(r.serial)).map(r=>({id:'legacy-'+r.id,branch:r.branch,type:r.status,serial:r.serial,at:'Data não informada',destination:'Registro importado • destino não informado'})));
 return {rows,movements};
}
export function selectWarehouseView(data,p){
 const {rows,movements}=warehouseRows(data),view=p.get('view'),query=(p.get('query')||'').trim().toLocaleLowerCase('pt-BR'),month=p.get('month')||'',destination=p.get('destination')||'',kind=p.get('kind')||'device',status=p.get('status')||'',category=p.get('category')||'',provider=p.get('provider')||'';
 const page=Number(p.get('page')||0),size=view==='chips'?7:8;
 if(!Number.isSafeInteger(page)||page<0||query.length>16000||month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(Error('Filtros inválidos.'),{status:400});
 const counts=Object.fromEntries(['device','chip'].map(k=>[k,Object.fromEntries(['Estoque','Reserva','Emergência','total'].map(c=>[c,rows.filter(r=>r.kind===k&&r.status==='Disponível'&&(c==='total'||(r.classification||'Estoque')===c)).length]))]));
 if(view==='overview'){const result=overviewData(rows,movements,month);result.batches=['device','chip'].flatMap(k=>result.batches.filter(b=>b.kind===k).slice(0,4));return {data:result,counts,carriers:carrierSummary(rows.filter(r=>r.kind==='chip'&&r.status==='Disponível').map(r=>({carrier:r.chip_operator})))};}
 if(view==='monthly')return {data:monthlyShipments(rows,movements,{month,months:Number(p.get('months')||6),destination}),counts};
 if(view==='detail'){const row=rows.find(r=>r.id===p.get('id'));if(!row)throw Object.assign(Error('Item não encontrado.'),{status:404});return {rows:[row],movements:movements.filter(m=>m.serial===row.serial)};}
 if(view==='batch')return {rows:rows.filter(r=>r.kind==='chip'&&r.activation_batch===p.get('id'))};
 if(view==='activation'){
  const reserve=rows.filter(reserveChip),list=reserve.filter(r=>[r.serial,r.chip_operator,r.chip_phone].some(v=>String(v||'').toLowerCase().includes(query))),batches=new Map();
  for(const r of rows.filter(r=>r.kind==='chip'&&r.activation_batch)){const b=batches.get(r.activation_batch)||[];b.push(r);batches.set(r.activation_batch,b);}
  const current=Math.min(page,Math.max(0,Math.ceil(list.length/20)-1));
  return {rows:list.slice(current*20,current*20+20),total:list.length,page:current,counts,activation:{available:reserve.filter(activationCandidate).length,waiting:rows.filter(r=>['requested','sending','uncertain'].includes(r.activation_state)).length,active:rows.filter(r=>r.activation_state==='active').length},batches:[...batches].map(([id,items])=>({id,count:items.length,prepared:items.some(r=>r.activation_state==='prepared')&&!items.some(r=>['sending','uncertain'].includes(r.activation_state)),uncertain:items.some(r=>['sending','uncertain'].includes(r.activation_state)),done:items.every(r=>r.activation_state==='active'),at:items[0].activation_at,reference:items[0].activation_reference}))};
 }
 let list,stats;
 if(view==='movements'){
  list=filterWarehouseMovements(movements,rows,{month,destination,scope:p.get('status')||'all',query});const known=new Map(rows.map(r=>[r.serial,r.kind]));
  stats={sent:list.filter(m=>(m.kind||known.get(m.serial))==='device'&&['Envio','Enviado'].includes(m.type)&&!m.detected).length,destinations:new Set(list.map(m=>m.destination).filter(Boolean)).size,total:movements.length,custom:[...new Set(movements.map(m=>m.destination).filter(d=>d&&!warehouseDestination(d)))].sort()};
 }else if(view==='items'||view==='chips')list=rows.filter(r=>r.kind===(view==='chips'?'chip':kind)&&(!destination||r.usage_branch===destination)&&(!status||r.status===status)&&(!category||(r.classification||'Estoque')===category)&&(!provider||r.chip_provider===provider)&&[r.serial,r.chip_phone,r.chip_operator,view==='chips'?(r.chip_provider==='arya'?'Árya':r.chip_provider==='link'?'Link Solutions':'Não informado'):r.usage_device_serial].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(query)));
 else throw Object.assign(Error('Visão inválida.'),{status:400});
 const current=Math.min(page,Math.max(0,Math.ceil(list.length/size)-1));return {rows:list.slice(current*size,(current+1)*size),total:list.length,page:current,counts,stats};
}
export async function warehouseView(c,branch,params){
 const plan=await readPlan(c,branch,['warehouse','movements'],params.get('since'));
 if(plan.delta&&!plan.changes.length)return {cursor:plan.cursor,unchanged:true};
 if(['items','chips'].includes(params.get('view'))){
  const chips=params.get('view')==='chips',size=chips?7:8,page=Number(params.get('page')||0),query=(params.get('query')||'').trim().toLocaleLowerCase('pt-BR');
  if(!Number.isSafeInteger(page)||page<0||query.length>16000)throw Object.assign(Error('Filtros inválidos.'),{status:400});
  const values=[branch,chips?'chip':params.get('kind')||'device',params.get('status')||'',params.get('category')||'',params.get('provider')||'',params.get('destination')||'',query,size,page,chips];
  const result=(await c.query(`with inventory as not materialized (
   select id,branch_id as branch,kind,serial,status,classification,received_at,version,activation_batch,activation_state,activation_at,activation_reference,chip_provider,chip_operator,chip_phone,usage_device_serial,usage_branch,usage_detected_at,chip_link_result,chip_monitor_result
   from central_homologacao.warehouse_items where branch_id=$1 and deleted_at is null
  ), filtered as not materialized (
   select * from inventory where kind=$2 and ($3='' or status=$3) and ($4='' or coalesce(nullif(classification,''),'Estoque')=$4) and ($5='' or chip_provider=$5) and ($6='' or usage_branch=$6)
   and ($7='' or exists(select 1 from unnest(array[serial,chip_phone,chip_operator,usage_device_serial,chip_link_result->>'serial',case when $10::boolean then case chip_provider when 'arya' then 'Árya' when 'link' then 'Link Solutions' else 'Não informado' end else usage_device_serial end]) value where strpos(lower(coalesce(value,'')),$7)>0))
  ), totals as (select count(*)::int as total from filtered), paging as (select total,least($9::int,greatest(0,ceil(total::numeric/$8::int)::int-1)) as page from totals)
  select total,page,coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('linked_iccid',(select d.data->>'iccid' from central_homologacao.devices d where d.branch_id=w.usage_branch and d.serial=w.usage_device_serial and d.deleted_at is null limit 1))) from (select * from filtered order by received_at desc,id limit $8 offset (select page*$8 from paging)) w),'[]') as rows,
  coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'category',coalesce(nullif(classification,''),'Estoque'),'count',n)) from (select kind,classification,count(*)::int n from inventory where status='Disponível' group by kind,classification) x),'[]') as categories from paging`,values)).rows[0];
  const counts={device:{Estoque:0,Reserva:0,'Emergência':0,total:0},chip:{Estoque:0,Reserva:0,'Emergência':0,total:0}};
  for(const r of result.categories){if(counts[r.kind]){counts[r.kind][r.category]=r.count;counts[r.kind].total+=r.count;}}
  return {cursor:plan.cursor,rows:result.rows.map(r=>({...r,received:new Date(r.received_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})})),total:result.total,page:result.page,counts};
 }
 if(['overview','monthly','movements'].includes(params.get('view')))return {...await sqlWarehouseAggregate(c,branch,params),cursor:plan.cursor};
 const data=await incrementalRead(c,branch,'warehouse',null);
 return {...selectWarehouseView(data,params),cursor:data.cursor};
}
