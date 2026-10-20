import {warehouseDay} from '../public/warehouse-model.js';
export function dischargeSeries(month,rows,now=new Date()){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(Error('Mês inválido.'),{status:400});
 const [year,m]=month.split('-').map(Number),today=warehouseDay(now),counts=new Map(rows.map(r=>[r.day,Number(r.count)]));
 const daily=Array.from({length:new Date(Date.UTC(year,m,0)).getUTCDate()},(_,i)=>({day:i+1,key:month+'-'+String(i+1).padStart(2,'0')})).filter(d=>d.key<=today).map(d=>({...d,counts:[counts.get(d.key)||0]}));
 return {month,daily,total:daily.reduce((n,d)=>n+d.counts[0],0)};
}
export async function dischargeSummary(c,branch,month,now=new Date()){
 dischargeSeries(month,[],now);
 const {rows}=await c.query(`select to_char(occurred_at at time zone 'America/Fortaleza','YYYY-MM-DD') as day,count(*)::int as count
 from central_homologacao.audit_events where branch_id=$1 and action in ('DISCHARGE','POST /api/install')
 and occurred_at >= (to_date($2||'-01','YYYY-MM-DD')::timestamp at time zone 'America/Fortaleza')
 and occurred_at < ((to_date($2||'-01','YYYY-MM-DD')+interval '1 month')::timestamp at time zone 'America/Fortaleza')
 group by day order by day`,[branch,month]);
 return dischargeSeries(month,rows,now);
}
