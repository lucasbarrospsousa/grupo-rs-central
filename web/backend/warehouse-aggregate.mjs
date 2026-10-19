import {warehouseLabel} from '../public/warehouse-model.js';

// Aggregations run under the caller's transaction/RLS. No service credentials or provider calls.
const base = `with inventory as materialized (
 select * from central_homologacao.warehouse_items where branch_id=$1 and deleted_at is null
), raw_events as (
 select m.id::text,m.branch_id as branch,m.destination,coalesce(m.note,'') as note,
 m.created_at, j.ordinality as ord,j.item,
 coalesce(nullif(j.item->>'detected_at',''),m.created_at::text) as stamp
 from central_homologacao.warehouse_movements m
 cross join lateral jsonb_array_elements(m.items) with ordinality j(item,ordinality)
 where m.branch_id=$1
), actual as (
 select id,branch,destination,note,created_at,ord,item->>'serial' as serial,
 coalesce(nullif(item->>'action',''),'Envio') as type,
 nullif(item->>'kind','') as kind,coalesce(item->>'device_serial','') as "deviceSerial",
 coalesce(item->>'phone','') as phone,coalesce(item->>'time_basis'='detection',false) as detected,
 case when pg_input_is_valid(stamp,'timestamp with time zone') then stamp::timestamptz end as at_ts
 from raw_events
), events as materialized (
 select a.*,coalesce(a.kind,(select w.kind from inventory w where w.serial=a.serial order by received_at limit 1)) as resolved_kind
 from actual a
 union all
 select 'legacy-'||w.id::text,w.branch_id,'Registro importado • destino não informado',null,null,0,w.serial,w.status,
 null,null,null,null,null,w.kind from inventory w
 where w.status in ('Utilizado','Enviado') and not exists(select 1 from actual a where a.serial=w.serial)
), normalized as (
 select e.*,to_char(at_ts at time zone 'America/Fortaleza','YYYY-MM-DD') as day,
 lower(trim(split_part(translate(coalesce(destination,''),'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ','aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),' • ',1))) as normalized_destination
 from events e
), labeled as materialized (
 select n.*,case when normalized_destination in ('imperatriz','araguaina','acailandia','maraba') then normalized_destination else '' end as base,
 case normalized_destination when 'imperatriz' then 'Imperatriz' when 'araguaina' then 'Araguaína' when 'acailandia' then 'Açailândia' when 'maraba' then 'Marabá' else coalesce(nullif(destination,''),'Não informado') end as destination_name
 from normalized n
), categories as (
 select kind,coalesce(nullif(classification,''),'Estoque') as category,count(*)::int as count from inventory where status='Disponível' group by kind,coalesce(nullif(classification,''),'Estoque')
)`;
const categories = `coalesce((select jsonb_agg(to_jsonb(c)) from categories c),'[]') as categories`;
const eventJSON = alias => `jsonb_strip_nulls(jsonb_build_object('id',${alias}.id,'branch',${alias}.branch,'type',${alias}.type,'kind',${alias}.kind,'serial',${alias}.serial,'deviceSerial',${alias}."deviceSerial",'phone',${alias}.phone,'note',${alias}.note,'detected',${alias}.detected,'atISO',${alias}.at_ts,'destination',${alias}.destination))`;
export function warehouseAggregateQuery(branch,p,now=new Date()){
 const view=p.get('view'),month=p.get('month')||'',query=(p.get('query')||'').trim().toLocaleLowerCase('pt-BR'),destination=p.get('destination')||'',page=Number(p.get('page')||0);
 if(!Number.isSafeInteger(page)||page<0||query.length>16000||month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(Error('Filtros inválidos.'),{status:400});
 if(view==='movements')return {values:[branch,month,destination,p.get('status')||'all',query,page],sql:base+`, filtered as materialized (
 select * from labeled where ($2='' or left(day,7)=$2)
 and ($3='' or (left($3,7)='custom:' and coalesce(destination,'')=substr($3,8)) or base=$3)
 and ($4='all' or $4='chips' and resolved_kind='chip' or $4='devices' and resolved_kind='device' or $4='shipments' and resolved_kind='device' and type in ('Envio','Enviado') and not coalesce(detected,false))
 and exists(select 1 from unnest(array[serial,type,destination,branch,note,"deviceSerial"]) v where strpos(lower(coalesce(v,'')),$5)>0)
), totals as (select count(*)::int as total from filtered), paging as (select total,least($6::bigint,greatest(0,ceil(total::numeric/8)::int-1))::int as page from totals)
 select total,page,${categories},
 coalesce((select jsonb_agg(${eventJSON('e')} order by at_ts desc nulls last,created_at desc nulls last,id,ord) from (select * from filtered order by at_ts desc nulls last,created_at desc nulls last,id,ord limit 8 offset (select page*8 from paging)) e),'[]') as rows,
 jsonb_build_object('sent',(select count(*) from filtered where resolved_kind='device' and type in ('Envio','Enviado') and not coalesce(detected,false)),
 'destinations',(select count(distinct destination) from filtered where coalesce(destination,'')<>''),'total',(select count(*) from events),
 'custom',coalesce((select jsonb_agg(destination order by destination collate "C") from (select distinct destination from labeled where base='' and coalesce(destination,'')<>'') x),'[]')) as stats from paging`};
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(Error('Período inválido'),{status:400});
 if(view==='monthly'){
  const months=Number(p.get('months')||6);if(![3,6,12].includes(months))throw Object.assign(Error('Período inválido'),{status:400});
  return {values:[branch,month,destination,now.toISOString(),months],sql:base+`, shipments as materialized (
 select *,case when base<>'' then base else 'custom:'||coalesce(nullif(destination,''),'Não informado') end as dest from labeled
 where resolved_kind='device' and type in ('Envio','Enviado') and not coalesce(detected,false)
 ), bucket as (select dest,left(day,7) as month,count(*)::int as count from shipments
 where ($3::text='' or dest=$3) and day<=to_char($4::timestamptz at time zone 'America/Fortaleza','YYYY-MM-DD')
 and left(day,7)>=to_char(to_date($2||'-01','YYYY-MM-DD')-($5::int-1)*interval '1 month','YYYY-MM') and left(day,7)<=$2 group by dest,left(day,7))
 select ${categories},coalesce((select jsonb_agg(to_jsonb(b)) from bucket b),'[]') as buckets,
 coalesce((select jsonb_agg(dest order by dest collate "C") from (select distinct dest from shipments) x),'[]') as destinations,
 (select count(*)::int from shipments where at_ts is null) as undated`};
 }
 if(view!=='overview')throw Object.assign(Error('Visão inválida.'),{status:400});
 return {values:[branch,month,now.toISOString()],sql:base+`, ranked as (
 select *,row_number() over(partition by serial,case when base<>'' then base else lower(trim(coalesce(destination,''))) end order by at_ts,created_at desc,id,ord) as occurrence
 from labeled where type in ('Envio','Enviado','Utilizado') and day<=to_char($3::timestamptz at time zone 'America/Fortaleza','YYYY-MM-DD')
 ), selected as materialized (select * from ranked where occurrence=1 and left(day,7)=$2),
 destinations as (select destination_name as name,count(*)::int as count,min(at_ts) as first_at from selected where resolved_kind='device' group by destination_name),
 batches as (select id,resolved_kind as kind,destination_name,coalesce(detected,false) as detected,count(*)::int as count,max(at_ts) as at_ts from selected group by id,resolved_kind,destination_name,coalesce(detected,false)),
 recent as (select *,row_number() over(partition by kind order by at_ts desc,id) as position from batches)
 select ${categories},
 (select count(*)::int from inventory where kind='chip' and activation_state='active' and to_char(activation_at at time zone 'America/Fortaleza','YYYY-MM')=$2) as activated,
 (select count(*)::int from inventory where kind='chip' and activation_state in ('requested','sending','uncertain')) as pending,
 coalesce((select jsonb_agg(jsonb_build_object('name',name,'count',count) order by count desc,first_at,name) from destinations),'[]') as destinations,
 coalesce((select jsonb_agg(jsonb_build_object('day',day,'name',destination_name,'count',count)) from (select day,destination_name,count(*)::int as count from selected where resolved_kind='device' group by day,destination_name) d),'[]') as daily,
 coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'destinationName',destination_name,'detected',detected,'count',count,'atISO',at_ts) order by kind,at_ts desc,id) from recent where position<=4 and kind in ('device','chip')),'[]') as batches`};
}
export async function sqlWarehouseAggregate(c,branch,p,now=new Date()){
 const q=warehouseAggregateQuery(branch,p,now),r=(await c.query(q.sql,q.values)).rows[0];
 const counts={device:{Estoque:0,Reserva:0,'Emergência':0,total:0},chip:{Estoque:0,Reserva:0,'Emergência':0,total:0}};
 for(const item of r.categories){if(counts[item.kind]){counts[item.kind][item.category]=item.count;counts[item.kind].total+=item.count;}}
 if(p.get('view')==='movements')return {rows:r.rows.map(e=>({...e,at:e.atISO?new Date(e.atISO).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}):e.id.startsWith('legacy-')?'Data não informada':'Invalid Date'})),total:r.total,page:r.page,stats:r.stats,counts};
 const month=p.get('month'),today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(p.get('view')==='overview'){
  const [year,m]=month.split('-').map(Number),days=new Date(Date.UTC(year,m,0)).getUTCDate(),lookup=new Map(r.daily.map(d=>[d.day+'|'+d.name,d.count]));
  return {counts,data:{available:counts.device.Estoque,chipTotal:counts.chip.total,chipCounts:['Estoque','Reserva','Emergência'].map(name=>({name,count:counts.chip[name]})),sent:r.destinations.reduce((n,d)=>n+d.count,0),activated:r.activated,pending:r.pending,destinations:r.destinations,batches:r.batches,
  daily:Array.from({length:days},(_,i)=>({day:i+1,key:month+'-'+String(i+1).padStart(2,'0')})).filter(d=>d.key<=today).map(d=>({...d,counts:r.destinations.map(dest=>lookup.get(d.key+'|'+dest.name)||0)}))}};
 }
 const months=Number(p.get('months')||6),destination=p.get('destination')||'',[year,m]=month.split('-').map(Number),key=offset=>new Date(Date.UTC(year,m-1+offset,1)).toISOString().slice(0,7),keys=Array.from({length:months},(_,i)=>key(i-months+1));
 const destinations=r.destinations.map(id=>({id,name:id.startsWith('custom:')?id.slice(7):warehouseLabel(id)})),buckets=r.buckets.filter(b=>!destination||b.dest===destination),count=k=>buckets.filter(b=>b.month===k).reduce((n,b)=>n+b.count,0),current=count(month),previous=count(key(-1));
 return {counts,data:{keys,destinations,groups:destinations.filter(d=>!destination||d.id===destination).map(d=>({...d,values:keys.map(k=>buckets.find(b=>b.dest===d.id&&b.month===k)?.count||0)})).filter(d=>d.values.some(Boolean)),current,previous,total:keys.reduce((n,k)=>n+count(k),0),difference:previous?Math.round((current-previous)/previous*100):null,undated:r.undated,partial:month===today.slice(0,7)}};
}
