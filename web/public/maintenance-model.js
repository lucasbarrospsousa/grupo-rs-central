export const visitStates={pendente:'Em análise',aguardando_peca:'Aguardando peça',aguardando_cliente:'Aguardando cliente',concluido:'Concluída',cancelado:'Cancelada'};
const clean=value=>String(value??'').trim();
export function normalizeVisit(row){
 if(row.medium==='Configurador RS300'||row.source==='Configurador RS300')return null;
 const client=clean(row.client||row.name),plate=clean(row.plate).toUpperCase(),currentSerial=clean(row.currentSerial||row.serial||row.sku);
 // Same admission rule as inventory_store.gd: technical configurator logs are not visits.
 if(!client||!plate||!currentSerial)return null;
 const status=visitStates[clean(row.status).toLowerCase()]||clean(row.status)||'Em análise';
 return {...row,client,plate,currentSerial,status,entry:clean(row.entry||row.created_at||row.opened_at),installSerial:clean(row.installSerial||row.replacement_serial||row.departure_serial),medium:clean(row.medium||row.discovery_method),notes:clean(row.notes??row.note)};
}
export function visibleVisits(rows){
 const mirrors=new Set(rows.filter(r=>r.source_table==='maintenance'&&r.source_id).map(r=>r.branch+':'+r.source_id));
 return rows.filter(r=>!r.legacy||!mirrors.has(r.branch+':'+r.id)).map(normalizeVisit).filter(Boolean).sort((a,b)=>(Date.parse(b.entry)||0)-(Date.parse(a.entry)||0));
}
export function visitCounts(rows){return [rows.length,rows.filter(r=>r.status==='Em análise').length,rows.filter(r=>r.status.startsWith('Aguardando')).length,rows.filter(r=>r.status==='Concluída').length];}
export function visitDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(date);}
