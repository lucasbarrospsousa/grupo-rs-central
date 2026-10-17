import {createHash} from 'node:crypto';
import {visibleVisits} from '../public/maintenance-model.js';
import {recordRows,recordIndicators} from '../public/maintenance-record.js';
export function selectHistoryView(rows,p){
 const page=Number(p.get('page')||0),search=p.get('search')||'';
 if(!Number.isSafeInteger(page)||page<0||search.length>16000)throw Object.assign(Error('Filtros inválidos.'),{status:400});
 const list=recordRows(visibleVisits(rows),{month:p.get('month')||'',search,model:p.get('model')||''}),total=list.length,current=Math.min(page,Math.max(0,Math.ceil(total/6)-1));
 return {rows:p.get('export')==='1'?list:p.get('view')==='indicators'?[]:list.slice(current*6,current*6+6),total,page:current,stats:recordIndicators(list)};
}
export async function historyView(c,branch,p){
 const legacy=(await c.query("select source_id as id,data from central_homologacao.legacy_records where branch_id=$1 and source_table='maintenance'",[branch])).rows.map(r=>({...r.data,id:r.id,branch,legacy:true,entry:r.data.created_at||r.data.opened_at||'',currentSerial:r.data.serial||'',installSerial:r.data.replacement_serial||'',medium:r.data.discovery_method||'',notes:r.data.note||''}));
 const visits=(await c.query('select id,data,version from central_homologacao.visits where branch_id=$1 order by created_at desc',[branch])).rows.map(r=>({...r.data,id:r.id,branch,version:r.version,editable:true}));
 const result=selectHistoryView([...visits,...legacy],p),cursor=createHash('sha256').update(JSON.stringify(result)).digest('hex');
 return p.get('since')===cursor?{cursor,unchanged:true}:{...result,cursor};
}
