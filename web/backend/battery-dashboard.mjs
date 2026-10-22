import {scoped} from './remote-actions.mjs';
// Separate records into observed discharge episodes; no interpolation across missing power or >2h gaps.
export const batteryDashboardCTE=`WITH fleet AS MATERIALIZED (
 select id,branch_id,serial,data->>'model' model from central_homologacao.devices
 where deleted_at is null and branch_id=any($1::text[])
 and regexp_replace(lower(coalesce(data->>'carrier','')),'[^a-z]','','g') in ('multi','multioperadora')
), readings AS MATERIALIZED (
 select h.device_id,h.branch_id,h.id,h.observed_at at,(h.sample->>'internal')::numeric internal,(h.sample->>'external')::numeric external
 from central_homologacao.battery_history h join fleet d on d.id=h.device_id and d.branch_id=h.branch_id
 where h.observed_at>=now()-interval '20 days' and h.observed_at<=now()
), previous AS (
 select *,lag(at) over w prev_at,lag(internal) over w prev_internal,lag(external) over w prev_external
 from readings window w as(partition by device_id,branch_id order by at,id)
), marked AS (
 select *,sum(case when external is distinct from 0 or prev_at is null or at-prev_at>interval '2 hours' then 1 else 0 end)
 over(partition by device_id,branch_id order by at,id) segment,
 case when external=0 and prev_external>=12 and prev_internal>=95 and at-prev_at<=interval '2 hours' then prev_at end start_at,
 case when external=0 and prev_external>=12 and prev_internal>=95 and at-prev_at<=interval '2 hours' then prev_internal end initial_internal,
 case when external=0 and prev_external>=12 and prev_internal>=95 and at-prev_at<=interval '2 hours' then prev_external end initial_external
 from previous
), episodes AS (
 select device_id,branch_id,segment,max(start_at) start_at,max(initial_internal) initial_internal,max(initial_external) initial_external,
 min(at) filter(where internal>=85 and internal<95) hit90,min(at) filter(where internal>=75 and internal<85) hit80,
 min(internal) minimum,min(at) first_zero,max(at) last_at
 from marked where external=0 group by device_id,branch_id,segment having max(start_at) is not null
), ranked_events AS (
 select *,row_number() over(partition by device_id,branch_id order by start_at desc) rn from episodes
), hits AS (
 select device_id,branch_id,'90' band,start_at,hit90 hit from episodes where hit90 is not null
 union all select device_id,branch_id,'80',start_at,hit80 from episodes where hit80 is not null
), ranked_hits AS (
 select *,row_number() over(partition by device_id,branch_id,band order by hit,start_at) rn from hits
), device_stats AS (
 select d.*,coalesce(r.samples,0) samples,r.minimum,r.first_at,r.last_at,
 exists(select 1 from episodes e where e.device_id=d.id and e.hit90 is not null) drop90,
 exists(select 1 from episodes e where e.device_id=d.id and e.hit80 is not null) drop80,
 e.initial_internal,e.initial_external,e.start_at,e.first_zero,e.minimum episode_minimum
 from fleet d left join (select device_id,count(*) samples,min(internal) minimum,min(at) first_at,max(at) last_at from readings group by device_id) r on r.device_id=d.id
 left join ranked_events e on e.device_id=d.id and e.rn=1
)`;
export async function batteryDashboard(pool,user,permissions,params){
 const fail=(message,status=400)=>Object.assign(Error(message),{status});
 if(!permissions.owner&&!permissions.views.includes('stock'))throw fail('Sem acesso ao Estoque.',403);
 const branch=params.get('branch'),q=(params.get('q')||'').trim(),page=Number(params.get('page')||1),serial=params.get('serial'),events=params.get('view')==='events';
 if(!['all','imperatriz','araguaina','acailandia','maraba'].includes(branch)||q.length>80||!Number.isInteger(page)||page<1||page>100000||events&&(branch==='all'||!/^\d{6,17}$/.test(serial||'')))throw fail('Filtro inválido.');
 return scoped(pool,user,async c=>{
 const memberships=(await c.query('select branch_id from central_homologacao.memberships where user_id=$1',[user.user_id])).rows.map(r=>r.branch_id);
 if(branch!=='all'&&!memberships.includes(branch)||!memberships.length)throw fail('Sem acesso à filial.',403);
 const branches=branch==='all'?memberships:[branch];
 if(events){const result=await c.query(batteryDashboardCTE+` select e.start_at,e.first_zero,e.last_at,e.initial_internal,e.initial_external,e.minimum,e.hit90,e.hit80 from episodes e join fleet d on d.id=e.device_id where d.serial=$2 order by e.start_at desc limit 50 offset $3`,[branches,serial,(page-1)*50]);return{rows:result.rows,page,more:result.rows.length===50};}
 const result=await c.query(batteryDashboardCTE+`, filtered AS (select * from device_stats where $2='' or position(lower($2) in lower(serial||' '||coalesce(model,'')))>0)
 select jsonb_build_object(
 'fleet',(select count(*) from fleet),'withHistory',(select count(*) from device_stats where samples>0),
 'drop90',(select count(*) from device_stats where drop90),'drop80',(select count(*) from device_stats where drop80),
 'below80',(select count(*) from device_stats where minimum<80),
 'coverageDays',(select count(distinct (at at time zone 'America/Fortaleza')::date) from readings),
 'firstAt',(select min(at) from readings),'lastAt',(select max(at) from readings),
 'timing',coalesce((select jsonb_agg(x) from (select band,count(*) filter(where hit-start_at<=interval '1 minute') fast,count(*) filter(where hit-start_at>interval '1 minute' and hit-start_at<=interval '5 minutes') medium,count(*) filter(where hit-start_at>interval '5 minutes') slow from ranked_hits where rn=1 group by band) x),'[]'),
 'total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(x) from(select * from filtered order by samples>0 desc,minimum asc nulls last,branch_id,serial limit 20 offset $3) x),'[]')) data`,[branches,q,(page-1)*20]);
 return {...result.rows[0].data,page};
 },{snapshot:true});
}
