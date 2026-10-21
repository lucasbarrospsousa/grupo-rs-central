import {batchIdentifier} from '../public/stock-model.js';
import {communicationFilterSql} from './communication-filter-sql.mjs';
import {ownerValidSql} from './saved-owners.mjs';
// All predicates run inside the caller's authenticated, RLS-protected transaction.
const fold=x=>`lower(regexp_replace(normalize(coalesce(${x},''),NFD),'[̀-ͯ]','','g'))`;
const natural=x=>`array(select case when part[1] ~ '^[0-9]+$' then lpad(ltrim(part[1],'0'),100,'0') else part[1] end from regexp_matches(coalesce(${x},''),'[0-9]+|[^0-9]+','g') part) collate "pt-x-icu"`;
const identifier=x=>`regexp_replace(upper(coalesce(${x},'')),'[\\s-]','','g')`;
const batchMatch=(serial,plate,identification,token)=>`(${serial}=${token} or (${identifier(token)}<>'' and (${identifier(plate)}=${identifier(token)} or ${identifier(identification)}=${identifier(token)})))`;
export function deviceSqlQuery(branch,params,options){
 const lookup=params.get('scope')==='lookup',maintenance=lookup&&params.get('mode')==='maintenance',query=lookup?params.get('query')||'':options.query;
 if(query.length>16000)throw Object.assign(Error('Busca muito longa.'),{status:400});
 const batch=!lookup&&/[;\r\n]/.test(query),wanted=[...new Set(query.split(/[;\r\n]+/).map(s=>s.trim()).filter(Boolean))];
 const text=query.trim(),compact=text.toLocaleLowerCase('pt-BR').replace(/[\s-]/g,''),connectivity=!lookup&&options.sort==='connectivity',ignition=!lookup&&options.ignition&&options.ignition!=='all';
 const values=[branch,text,batch,wanted,lookup?params.get('status')||'':options.status,options.start,options.end,options.page,params.get('customer')||'',params.get('export')==='1',compact,options.ignition||'all',wanted.map(batchIdentifier).filter(Boolean)];
 const status=`coalesce(d.data->>'status','')`,client=`coalesce(d.data->>'client','')`;
 const owner=`case when ${ownerValidSql} then d.data->'owner_binding'->>'client' else '' end`;
 const searchFields=lookup?(maintenance?['d.serial',...['plate','identification','client'].map(k=>`d.data->>'${k}'`)]:['d.serial',`d.data->>'client'`,`d.data->>'plate'`]):['d.serial',...['identification','plate','phone','iccid','carrier'].map(k=>`d.data->>'${k}'`),owner];
 const textMatch=lookup?searchFields.map(x=>`strpos(lower(coalesce(${x},'')),lower($2))>0${maintenance?'':` or strpos(regexp_replace(lower(coalesce(${x},'')),'[\\s-]','','g'),$11)>0`}`).join(' or '):searchFields.map(x=>`strpos(${fold(x)},${fold('$2')})>0`).join(' or ');
 const match=lookup?`($2='' or ${maintenance?'':`case when $11 ~ '^[0-9]+$' then d.serial=$11 else `}(${textMatch})${maintenance?'':' end'})${maintenance?'':` and ($5='' or ${status}=$5)`}`:`case when $3 then (d.serial=any($4::text[]) or ${identifier("d.data->>'plate'")}=any($13::text[]) or ${identifier("d.data->>'identification'")}=any($13::text[])) else (${textMatch}) end`;
 const date=`left(coalesce(${['updated_at','created_at','source_date','purchase_date','date'].map(k=>`nullif(d.data->>'${k}','')`).join(',')},''),10)`;
 const visible=`case when $1<>'imperatriz' and ${status}='Reserva' then 'Estoque' else ${status} end`;
 const install=`case when pg_input_is_valid(d.data->>'installed_at','timestamp with time zone') then (d.data->>'installed_at')::timestamptz end`;
 let order='serial collate "pt-x-icu",id';
 if(!lookup){
  if(options.sort==='default')order=`${options.status==='Todos'?"case raw_status when 'Estoque' then 0 when 'Reserva' then 1 when 'Manutenção' then 2 when 'Instalado' then 3 when 'Inativos' then 4 when 'Inativo' then 4 else 5 end,":''}case when raw_status='Instalado' then installed end desc nulls last,${natural('serial')},serial,id`;
  else order=`(sort_value=''),${natural('sort_value')} ${options.direction===1?'asc':'desc'},serial collate "pt-x-icu",id`;
 }
 const sortValue=connectivity?`case when o.data->'chip'->>'ok'='true' then coalesce(nullif(o.data->'chip'->>'connectivity',''),'Não informado') else 'Consulta pendente' end`:options.sort==='serial'?'d.serial':`coalesce(d.data->>'${['carrier','status','installed_at'].includes(options.sort)?options.sort:'status'}','')`;
 const sql=`with parameters as (select $1::text,$2::text,$3::boolean,$4::text[],$5::text,$6::text,$7::text,$8::int,$9::text,$10::boolean,$11::text,$12::text,$13::text[]), inventory as materialized (
 select d.id,d.serial,d.data->>'plate' as plate,d.data->>'identification' as identification,${status} as raw_status,${visible} as visible_status,${client} as client,${date} as product_date,${install} as installed,${sortValue} as sort_value,(${match}) as matched,${ignition?communicationFilterSql():"'all'"} as ignition_state
 from central_homologacao.devices d ${connectivity||ignition?'left join central_homologacao.device_observations o on o.device_id=d.id':''}
 where d.branch_id=$1 and d.deleted_at is null
 ), filtered as materialized (select * from inventory where matched and ($12='all' or ignition_state=$12) and ${lookup?"($9='' or client=$9)":"($5='Todos' or visible_status=$5) and (($6='' and $7='') or (product_date<>'' and ($6='' or product_date>=$6) and ($7='' or product_date<=$7)))"}),
 totals as (select count(*)::int as total from filtered), paging as (select total,least($8::int,greatest(1,ceil(total::numeric/10)::int)) as page from totals),
 selected as (select *,row_number() over(order by ${order}) as ordinal from filtered order by ${order} limit (case when $10::boolean then null else 10 end) offset (case when $10::boolean then 0 else (select (page-1)*10 from paging) end))
 select total,page,
 coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('observation',o.data,'checked_at',o.checked_at) order by s.ordinal) from selected s join central_homologacao.devices d on d.id=s.id and d.branch_id=$1 and d.deleted_at is null left join central_homologacao.device_observations o on o.device_id=d.id),'[]') as rows,
 (select count(*)::int from inventory where matched) as found,
 coalesce((select jsonb_object_agg(visible_status,n) from (select visible_status,count(*)::int n from inventory group by visible_status) counts),'{}')||jsonb_build_object('Todos',(select count(*)::int from inventory)) as counts,
 coalesce((select jsonb_agg(w order by ord) from unnest($4::text[]) with ordinality t(w,ord) where not exists(select 1 from inventory i where i.matched and ${batchMatch('i.serial','i.plate','i.identification','w')})),'[]') as missing,
 case when ${lookup} then coalesce((select jsonb_agg(client order by first_serial) from (select client,min(serial) as first_serial from inventory where matched and client<>'' group by client) customers),'[]') else '[]'::jsonb end as customers from paging`;
 return {sql,values,batch,requested:wanted.length,lookup};
}
export async function sqlDevicePage(c,branch,params,options){
 const query=deviceSqlQuery(branch,params,options),r=(await c.query(query.sql,query.values)).rows[0];
 const rows=r.rows.map(d=>({identification:'',model:'',installed_at:'',updated_at:'',...d.data,id:d.id,serial:d.serial,branch,version:d.version,observation:d.observation,checked_at:d.checked_at}));
 if(params.get('export')==='1')for(const row of rows){const chip=row.observation?.chip;row.connectivity=chip?.ok?chip.connectivity||'Não informado':'Consulta pendente';}
 return query.lookup?{rows,total:r.total,page:r.page,customers:r.customers}:{rows,total:r.total,page:r.page,counts:Object.fromEntries(['Todos','Estoque','Reserva','Instalado','Manutenção','Inativos'].map(s=>[s,r.counts[s]||0])),found:r.found,missing:query.batch?r.missing:[],batch:query.batch,requested:query.requested};
}
