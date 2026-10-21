import {guardedIntegrations} from './background-sync.mjs';
import {trackQueries} from './query-usage.mjs';
import {randomUUID} from 'node:crypto';
export function warehouseChipState(r,iccid){
 if(!r?.ok||r.iccid!==iccid)return null;
 const status=String(r.status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 if(/BLOQUE|BLOCK|CANCEL|SUSPEN|QUARENT|QUARANT/.test(status))return null;
 if(['PENDENTE','PENDING'].includes(status))return 'reserve';
 return ['Off','Online'].includes(r.connectivity)?'active':null;
}
export function warehouseChipTick(pool,{service}={}){return trackQueries(pool,'automatic',async()=>{
 const lease=randomUUID();const rows=(await pool.query('select * from central_homologacao.warehouse_chip_claim($1)',[lease])).rows;
 if(!rows.length)return {processed:0};service=service||guardedIntegrations(pool);let processed=0;
 for(const row of rows){let result={ok:false,message:'Consulta pendente'};try{result=await service.carrier(row.chip_provider,row.serial);}catch{}const state=warehouseChipState(result,row.serial);
 await pool.query('select central_homologacao.warehouse_chip_save($1,$2,$3,$4,$5,$6)',[row.id,lease,row.version,state,JSON.stringify({ok:result.ok===true&&result.iccid===row.serial,iccid:row.serial,provider:row.chip_provider,status:result.status||'',connectivity:result.connectivity||'',checked_at:new Date().toISOString()}),result.phone||'']);processed++;}
 return {processed};
 },'stock');}
