import {filterStock,visibleStatus,statuses,stockPageNumber} from '../public/stock-model.js';
import {stockSummary,carrierSummary} from '../public/dashboard-model.js';
import {readPlan} from './incremental-read.mjs';
const bad=message=>Object.assign(Error(message),{status:400});
export function pageOptions(params){
 const o={query:params.get('query')||'',status:params.get('status')||'Todos',start:params.get('start')||'',end:params.get('end')||'',sort:params.get('sort')||'default',direction:Number(params.get('direction')||-1),page:Number(params.get('page')||1)};
 if(o.query.length>16000||!statuses.includes(o.status)||!['default','serial','connectivity','carrier','status','installed_at'].includes(o.sort)||![1,-1].includes(o.direction)||!Number.isSafeInteger(o.page)||o.page<1||[o.start,o.end].some(x=>x&&!/^\d{4}-\d{2}-\d{2}$/.test(x))||o.start&&o.end&&o.start>o.end)throw bad('Filtros inválidos.');
 return o;
}
export function selectDevicePage(rows,branch,options){
 const filtered=filterStock(rows,{...options,branch}),total=filtered.rows.length,page=stockPageNumber(options.page,total,10);
 return {...filtered,total,page,rows:filtered.rows.slice((page-1)*10,page*10),counts:Object.fromEntries(statuses.map(s=>[s,s==='Todos'?rows.length:rows.filter(r=>visibleStatus(r,branch)===s).length]))};
}
// Only small search/sort fields are read for the whole branch; full records are read for ten IDs.
export async function devicePage(c,branch,params){
 const options=pageOptions(params),plan=await readPlan(c,branch,['devices'],params.get('since'));
 if(plan.delta&&!plan.changes.length)return {cursor:plan.cursor,unchanged:true};
 const summary=params.get('scope')==='summary';
 const fields=summary?['status','carrier']:['client','status','carrier','identification','plate','phone','iccid','owner_binding','installed_at','updated_at','created_at','source_date','purchase_date','date','model'];
 const projection=fields.map(k=>`'${k}',d.data->'${k}'`).join(',');
 const compact=(await c.query(`select d.id,d.serial,jsonb_build_object(${projection}) as data${summary?'':",o.data->'chip' as chip"} from central_homologacao.devices d ${summary?'':'left join central_homologacao.device_observations o on o.device_id=d.id'} where d.branch_id=$1 and d.deleted_at is null order by d.serial`,[branch])).rows.map(r=>({...r.data,id:r.id,serial:r.serial,connectivity:r.chip?.ok?r.chip.connectivity||'Não informado':'Consulta pendente'}));
 if(summary)return {cursor:plan.cursor,total:compact.length,statuses:stockSummary(compact),carriers:carrierSummary(compact)};
 const result=selectDevicePage(compact,branch,options);
 if(params.get('export')==='1')return {...result,rows:filterStock(compact,{...options,branch}).rows,cursor:plan.cursor};
 const ids=result.rows.map(r=>r.id);
 const full=ids.length?(await c.query('select d.id,d.serial,d.data,d.version,o.data as observation,o.checked_at from central_homologacao.devices d left join central_homologacao.device_observations o on o.device_id=d.id where d.branch_id=$1 and d.deleted_at is null and d.id=any($2::uuid[])',[branch,ids])).rows:[];
 const map=new Map(full.map(r=>[r.id,{identification:'',model:'',installed_at:'',updated_at:'',...r.data,id:r.id,serial:r.serial,branch,version:r.version,observation:r.observation,checked_at:r.checked_at}]));
 return {...result,rows:ids.map(id=>map.get(id)),cursor:plan.cursor};
}
