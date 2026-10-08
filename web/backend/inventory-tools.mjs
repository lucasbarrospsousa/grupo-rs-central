import {trackerClassification} from '../public/tracker-classification.js';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
export const identityKey=v=>String(v||'').replace(/[\s-]/g,'').toUpperCase();
export function exactEquipment(row,q){return [row.serial,row.iccid,row.identification,row.plate,row.phone].some(v=>v&&identityKey(v)===identityKey(q));}
export async function lookupEquipment(c,service,branch,q){
 if(typeof q!=='string'||q.trim().length<3||q.length>80)throw fail('Informe série, identificação, ICCID ou telefone.');
 q=q.trim();
 const saved=(await c.query("select id,serial,data,version from central_homologacao.devices where branch_id=$1 and deleted_at is null and (serial=$2 or data->>'iccid'=$2 or regexp_replace(upper(data->>'identification'),'[ -]','','g')=$3 or regexp_replace(data->>'phone','[^0-9]','','g')=$2) limit 3",[branch,q,identityKey(q)])).rows;
 if(saved.length>1)throw fail('Mais de um cadastro corresponde à busca. Confira a série.');
 let row=saved[0]?{...saved[0].data,serial:saved[0].serial}:null,warning='';
 try{const remote=row?await service.equipmentPortal(branch,row.serial):await service.lookupEquipment(branch,q);if(!remote?.serial||remote.ok===false||(!row&&!exactEquipment(remote,q))||(row&&remote.serial!==row.serial))throw fail('A origem não confirmou uma correspondência exata.');if(/^(XRS|GRS|AAA)[ -]*\d+$/i.test(remote.plate||''))remote.identification=remote.plate;row={...row,...Object.fromEntries(Object.entries(remote).filter(([,v])=>v!==''&&v!=null))};}
 catch(e){if(!row)throw e;warning='Dados salvos na Central. Consulta externa pendente: '+e.message;}
 const identification=row.identification||(/^(XRS|GRS|AAA)[ -]*\d+$/i.test(row.plate||'')?row.plate:'');
 return {data:{serial:row.serial,identification,iccid:row.iccid||'',phone:row.phone||'',carrier:row.carrier||'',model:trackerClassification(identification,row.model),plate:row.plate||''},existing:saved[0]?{id:saved[0].id,version:saved[0].version}:null,warning};
}
export async function inventoryCounts(c,branch,access){
 const result={branch,checked_at:new Date().toISOString()};
 if(access.owner||access.views.some(m=>['overview','stock'].includes(m)))result.stock=Number((await c.query('select count(*) as n from central_homologacao.devices where branch_id=$1 and deleted_at is null and central_homologacao.is_monitored_stock(branch_id,data)',[branch])).rows[0].n);
 if(access.owner||access.views.includes('warehouse')){const rows=(await c.query("select kind,count(*) as n from central_homologacao.warehouse_items where branch_id=$1 and deleted_at is null and status='Disponível' and (kind<>'chip' or classification='Estoque') group by kind",[branch])).rows;result.warehouse=Number(rows.find(r=>r.kind==='device')?.n||0);result.chips=Number(rows.find(r=>r.kind==='chip')?.n||0);}
 return result;
}
