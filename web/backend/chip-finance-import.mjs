// Administrative import of reviewed snapshots. Never updates devices or warehouse stock.
export function validateFinanceSource(source){
 if(!['arya','link'].includes(source.provider)||!Number.isFinite(Date.parse(source.checked_at))||!Array.isArray(source.items)||!Array.isArray(source.invoices))throw Error('Fonte financeira inválida.');
 const ids=new Set();
 for(const r of source.items){if(!/^89\d{17,18}$/.test(r.iccid)||ids.has(r.iccid)||typeof r.active!=='boolean'||!(r.cents===null||Number.isSafeInteger(r.cents)&&r.cents>=0))throw Error('Chip inválido ou duplicado.');ids.add(r.iccid);}
 const invoices=new Set();
 for(const i of source.invoices){
  if(!i.id||invoices.has(i.id)||!/^\d{4}-\d{2}-\d{2}$/.test(i.due_date)||!Number.isSafeInteger(i.total_cents)||i.total_cents<0||!i.source_url||!Number.isFinite(Date.parse(i.checked_at)))throw Error('Fatura inválida.');
  invoices.add(i.id);
  if(i.items){if(!Array.isArray(i.items)||i.items.some(r=>!Number.isSafeInteger(r.cents)||r.cents<0||r.iccid&&!/^89\d{17,18}$/.test(r.iccid))||i.items.reduce((n,r)=>n+r.cents,0)!==i.total_cents)throw Error('Itens não fecham com a fatura.');}
 }
 return source;
}
export async function importFinanceSource(client,source){
 validateFinanceSource(source);
 const old=(await client.query('select checked_at,invoices from central_homologacao.chip_cost_snapshots where provider=$1 for update',[source.provider])).rows[0];
 if(!old||old.checked_at&&Date.parse(old.checked_at)>Date.parse(source.checked_at))throw Error('Snapshot mais recente já salvo; importação recusada.');
 const invoices=new Map((old.invoices||[]).map(i=>[i.id,i]));
 for(const i of source.invoices){const prior=invoices.get(i.id);if(prior&&Date.parse(prior.checked_at)>Date.parse(i.checked_at))throw Error('Fatura mais recente já salva.');invoices.set(i.id,i);}
 await client.query('update central_homologacao.chip_cost_snapshots set items=$2::jsonb,checked_at=$3,invoices=$4::jsonb,last_error=null where provider=$1',[source.provider,JSON.stringify(source.items),source.checked_at,JSON.stringify([...invoices.values()])]);
}
