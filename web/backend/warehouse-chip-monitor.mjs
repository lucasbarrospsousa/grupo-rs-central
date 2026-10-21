import {guardedIntegrations} from './background-sync.mjs';
import {trackQueries} from './query-usage.mjs';
import {aryaCostSnapshot,linkCostSnapshot} from './warehouse-costs.mjs';
import {randomUUID} from 'node:crypto';
export function warehouseChipState(r,iccid){
 if(!r||r.iccid!==iccid||r.found===false)return null;
 const status=String(r.status||'').trim().toUpperCase();
 if(['PENDENTE','PENDING'].includes(status))return 'reserve';
 // Lifecycle confirmed by the provider parser. Connectivity never activates a chip.
 return r.active===true&&['ATIVO','ATIVO - NUNCA CONECTADO','VINCULADO'].includes(status)?'active':null;
}
export function warehouseChipTick(pool,{service}={}){return trackQueries(pool,'automatic',async()=>{
 const lease=randomUUID(),rows=(await pool.query('select * from central_homologacao.warehouse_chip_claim($1)',[lease])).rows;
 if(!rows.length)return {processed:0};service=service||guardedIntegrations(pool);let processed=0;
 const sources=new Map();
 if(rows.some(r=>r.chip_provider==='arya')){
  const source=(await pool.query('select central_homologacao.warehouse_reserve_source($1) as data',[lease])).rows[0].data;
  let snapshot=source;
  if(source.refresh){try{const fresh=await aryaCostSnapshot(service);await pool.query('select central_homologacao.warehouse_reserve_source_save($1,$2)',[JSON.stringify([...fresh.rows.values()]),fresh.checked_at]);snapshot={items:[...fresh.rows.values()],checked_at:fresh.checked_at};}catch{snapshot=null;}}
  if(snapshot?.checked_at&&Date.now()-Date.parse(snapshot.checked_at)<3600000)sources.set('arya',new Map(snapshot.items.map(r=>[r.iccid,{...r,checked_at:snapshot.checked_at}])));
 }
 const links=rows.filter(r=>r.chip_provider==='link');if(links.length)try{sources.set('link',(await linkCostSnapshot(service,links.map(r=>r.serial))).rows);}catch{}
 for(const row of rows){const result=sources.get(row.chip_provider)?.get(row.serial),state=warehouseChipState(result,row.serial);
 await pool.query('select central_homologacao.warehouse_chip_save($1,$2,$3,$4,$5,$6)',[row.id,lease,row.version,state,JSON.stringify({ok:!!result,iccid:row.serial,provider:row.chip_provider,status:result?.status||'',checked_at:result?.checked_at||null}),result?.phone||'']);processed++;}
 return {processed};
 },'warehouse');}
