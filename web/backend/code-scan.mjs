import {randomUUID} from 'node:crypto';
import {trackQueries} from './query-usage.mjs';
const compact=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function codeResult(row,result){
 if(!result?.ok||result.serial!==row.serial||!/^[1-9]\d*$/.test(result.id||''))throw Error('Série ou código do aparelho não confirmado.');
 const common={equipment_id:result.id,vehicle_id:result.vehicle_id||null,api_plate:result.plate||null,apn:String(result.apn||'').trim().toLowerCase().slice(0,200),iccid:String(result.iccid||'').trim()};
 if(!result.vehicle_id){if(result.binding_known!==true||result.plate)throw Error('Resposta sem confirmação do vínculo.');return{...common,state:'unlinked'};}
 if(!/^[1-9]\d*$/.test(result.vehicle_id)||!result.plate)throw Error('Código ou placa do veículo não confirmado.');
 return{...common,state:compact(row.plate)===compact(result.plate)?'confirmed':'divergent'};
}
export function scanConfig(body){
 const bad=message=>{throw Object.assign(Error(message),{status:400});};
 if(typeof body.enabled!=='boolean'||!Number.isInteger(body.interval_seconds)||body.interval_seconds<25||body.interval_seconds>3600)bad('Informe um intervalo inteiro de 25 a 3600 segundos.');
 const out={enabled:body.enabled,interval_seconds:body.interval_seconds};
 if(body.nightly_enabled!==undefined){
  if(typeof body.nightly_enabled!=='boolean'||!Number.isInteger(body.batch_limit)||body.batch_limit<1||body.batch_limit>10||typeof body.priority!=='boolean')bad('Confira o lote (1 a 10 aparelhos) e as opções da programação.');
  if(![body.night_start,body.night_end].every(v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v))||body.night_start===body.night_end)bad('Informe início e fim diferentes para a janela noturna.');
  Object.assign(out,{nightly_enabled:body.nightly_enabled,batch_limit:body.batch_limit,night_start:body.night_start,night_end:body.night_end,priority:body.priority});
 }
 return out;
}
export function codeTick(pool,{service,budgetMs=45000,now=Date.now}={}){return trackQueries(pool,'automatic',async()=>{
 const lease=randomUUID(),batch=(await pool.query('select central_homologacao.code_scan_claim($1) as data',[lease])).rows[0].data;
 if(!batch.rows.length)return{processed:0,complete:!!batch.complete};
 const start=now();let processed=0,backoff=0;
 try{for(const row of batch.rows){if(now()-start>=budgetMs)break;let result;
  try{result=codeResult(row,await service.equipment('imperatriz',row.serial));}
  catch(e){if(e.automaticDeferred)return{processed,batch:batch.batch,deferred:e.reason};result={state:'error',message:e.message};backoff=e.credentialInvalid?900:e.status===429||e.upstreamStatus===429?120:60;}
  await pool.query('select central_homologacao.code_scan_save($1,$2,$3,$4)',[lease,row.id,row.serial,result]);processed++;
  if(backoff)break;
 }return{processed,batch:batch.batch,backoff};}
 finally{await pool.query('select central_homologacao.code_scan_release($1,$2,$3)',[lease,Math.round(now()-start),backoff]);}
 },'codes');}
