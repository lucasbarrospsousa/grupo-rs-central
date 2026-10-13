import {scoped} from './remote-actions.mjs';
// Read-only inventory exports/listings: never one request per SIM.
const fail=()=>Object.assign(Error('A Árya não confirmou o formato dos valores. Total não calculado.'),{status:502});
const cache=new WeakMap();
export function brlCents(value){
 const s=String(value??'').trim().replace(/^R\$\s*/, '');
 if(!/^\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(s))return null;
 const [whole,decimal='']=s.replaceAll('.','').split(',');const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 return Number.isSafeInteger(n)&&n>=0?n:null;
}
export function parseAryaCosts(text){
 if(typeof text!=='string'||text.length>8*1024*1024)throw fail();
 const table=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
 else if(!quoted&&(c===';'||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){if(row.some(Boolean))table.push(row);row=[];}}else cell+=c;}
 if(quoted)throw fail();row.push(cell.replace(/\r$/,''));if(row.some(Boolean))table.push(row);
 const header=table.shift()?.map(s=>s.replace(/^\uFEFF/,'').trim()),required=['ICCID','STATUS','VALOR NEGOCIADO','OPERADORA'];
 if(!header||required.some(k=>header.filter(h=>h===k).length!==1))throw fail();
 const result=new Map();for(const values of table){if(values.length!==header.length)throw fail();const get=k=>values[header.indexOf(k)]?.trim()||'',iccid=get('ICCID').replace(/^="(89\d{17,18})"$/, '$1');if(!/^89\d{17,18}$/.test(iccid)||result.has(iccid))throw fail();
 result.set(iccid,{iccid,active:get('STATUS')==='ATIVO',status:get('STATUS'),cents:brlCents(get('VALOR NEGOCIADO')),operator:get('OPERADORA'),plan:get('PLANO')});}
 return result;
}
export async function aryaCostSnapshot(service){
 let entry=cache.get(service);if(entry&&Date.now()-entry.at<30*60*1000)return entry.promise;
 entry={at:Date.now(),promise:null};entry.promise=(async()=>({rows:parseAryaCosts(await service.aryaRequest('/customer/inventary/export',{filters:{},inventaryFlag:'default'})),checked_at:new Date().toISOString()}))();cache.set(service,entry);
 try{return await entry.promise;}catch(e){if(cache.get(service)===entry)cache.delete(service);throw e;}
}
export function decimalCents(value){
 const s=String(value??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,decimal='']=s.split('.'),n=Number(whole)*100+Number(decimal.padEnd(2,'0'));return Number.isSafeInteger(n)&&n>=0?n:null;
}
export function parseLinkCost(row){
 const iccid=String(row?.iccid||'');if(!/^89\d{17,18}$/.test(iccid)||typeof row.phase__name!=='string')throw Error('Link retornou chip ou fase inválida.');
 // Status Online/Standby describes connectivity, not the billing lifecycle.
 return{iccid,active:row.phase__name==='Vinculado'&&!!row.charge_start,status:row.phase__name,cents:decimalCents(row.item__base_price),operator:String(row.operator__name||''),plan:String(row.soldplan__name||'')};
}
export async function linkCostSnapshot(service,iccids,onBatch=async()=>{}){
 const unique=[...new Set(iccids)],result=new Map();
 if(unique.length>10000||unique.some(x=>!/^89\d{17,18}$/.test(x)))throw Error('ICCID inválido para a consulta Link.');
 for(let at=0;at<unique.length;at+=100){const batch=unique.slice(at,at+100),data=await service.linkCostBatch(batch);
  if(!Array.isArray(data))throw Error('Link não confirmou a lista de chips.');
  const found=new Set();for(const raw of data){if(!batch.includes(String(raw?.iccid||'')))continue;const row={...parseLinkCost(raw),checked_at:new Date().toISOString()};if(found.has(row.iccid))throw Error('Link retornou ICCID divergente ou repetido.');found.add(row.iccid);result.set(row.iccid,row);}
  for(const iccid of batch)if(!found.has(iccid))result.set(iccid,{iccid,found:false,active:false,cents:null,operator:'',plan:'',status:'Não localizado'});
  await onBatch([...result.values()].filter(r=>batch.includes(r.iccid)));
 }
 return{rows:result,checked_at:new Date().toISOString()};
}
export const costProviders={arya:'Árya',link:'Link Solutions'};
export async function savedCostSnapshots(pool,user){
 return scoped(pool,user,async c=>(await c.query('select provider,items,checked_at,last_attempt,last_error,refresh_until from central_homologacao.chip_cost_snapshots order by provider')).rows.map(r=>({...r,rows:new Map(r.items.map(x=>[x.iccid,x]))})));
}
export async function refreshCostSnapshots(pool,user,service,devices=[]){
 // Durable leases and cooldown survive restarts and simultaneous browser tabs.
 for(const provider of Object.keys(costProviders)){
  const acquired=await scoped(pool,user,async c=>(await c.query("update central_homologacao.chip_cost_snapshots set refresh_until=now()+interval '3 minutes',last_attempt=now() where provider=$1 and (refresh_until is null or refresh_until<now()) and (checked_at is null or (provider='arya' and checked_at<now()-interval '30 minutes')) and (last_attempt is null or last_attempt<now()-interval '2 minutes') returning provider",[provider])).rowCount);
  if(!acquired)continue;
  try{let snapshot;
   if(provider==='arya')snapshot=await aryaCostSnapshot(service);
   else{const saved=await savedCostSnapshots(pool,user),arya=saved.find(s=>s.provider==='arya');
    if(!arya?.checked_at||arya.last_error)throw Error('Aguardando consulta Árya para separar os provedores.');
    const previous=saved.find(s=>s.provider==='link').rows;
    const targets=devices.map(d=>String(d.iccid||'').trim()).filter(iccid=>/^89\d{17,18}$/.test(iccid)&&!arya.rows.has(iccid)&&!previous.has(iccid));
    const loaded=await linkCostSnapshot(service,targets,async batch=>{for(const row of batch)previous.set(row.iccid,row);await scoped(pool,user,c=>c.query("update central_homologacao.chip_cost_snapshots set items=$2::jsonb,refresh_until=now()+interval '3 minutes' where provider=$1",['link',JSON.stringify([...previous.values()])]));});
    snapshot={rows:previous,checked_at:loaded.checked_at};
   }
   await scoped(pool,user,c=>c.query('update central_homologacao.chip_cost_snapshots set items=$2::jsonb,checked_at=$3,last_error=null,refresh_until=null where provider=$1',[provider,JSON.stringify([...snapshot.rows.values()]),snapshot.checked_at]));
  }catch{
   // Keep the last good values and date; a failed read never becomes “not found”.
   await scoped(pool,user,c=>c.query('update central_homologacao.chip_cost_snapshots set last_error=$2,refresh_until=null where provider=$1',[provider,costProviders[provider]+': atualização não concluída; valores anteriores preservados.']));
  }
 }
 return savedCostSnapshots(pool,user);
}
export function summarizeCosts(devices,input){
 const sources=Array.isArray(input)?input:[{provider:'arya',...input}],chips=new Map();let missing=0,duplicates=0;
 for(const d of devices){const iccid=String(d.iccid||'').trim();if(!/^89\d{17,18}$/.test(iccid)){missing++;continue;}const association={serial:d.serial,apn:String(d.apn||'').trim(),plate:String(d.plate||'').trim()};if(chips.has(iccid)){duplicates++;chips.get(iccid).devices.push(d.serial);chips.get(iccid).associations.push(association);}else chips.set(iccid,{iccid,devices:[d.serial],associations:[association]});}
 let total=0,confirmed=0,notFound=0,inactive=0,withoutPrice=0,conflicts=0,pending=0;const groups=new Map(),items=[];
 const providers=sources.map(s=>({provider:s.provider,name:costProviders[s.provider],checked_at:s.checked_at||null,error:s.last_error||'',refreshing:Date.parse(s.refresh_until)>Date.now(),confirmed:0,total_cents:0}));
 const incomplete=sources.length<2||sources.some(s=>!s.checked_at||s.last_error);
 for(const chip of chips.values()){
  chip.apns=[...new Set(chip.associations.map(d=>d.apn||'Não informada'))].sort();chip.apn=chip.apns.join(' / ');
  const matches=sources.flatMap(s=>s.rows.has(chip.iccid)&&s.rows.get(chip.iccid).found!==false?[{...s.rows.get(chip.iccid),provider:s.provider,checked_at:s.checked_at||s.rows.get(chip.iccid).checked_at}]:[]),active=matches.filter(r=>r.active),r=active.length===1?active[0]:matches[0];let state;
  if(active.length>1){conflicts++;state='Conferir: ativo em dois provedores';}
  else if(!r){if(incomplete||!sources.find(s=>s.provider==='link')?.rows.has(chip.iccid)){pending++;state='Consulta dos provedores pendente';}else{notFound++;state='Não localizado nos provedores';}}
  else if(!r.active){inactive++;state='Não ativo';}
  else if(r.cents===null){withoutPrice++;state='Mensalidade não informada';}
  else{state='Confirmado';confirmed++;total+=r.cents;const key=[r.provider,r.operator,chip.apn,r.cents].join('|'),g=groups.get(key)||{provider:r.provider,operator:r.operator,apn:chip.apn,cents:r.cents,count:0};g.count++;groups.set(key,g);const p=providers.find(p=>p.provider===r.provider);p.confirmed++;p.total_cents+=r.cents;}
  items.push({...chip,state,provider:r?.provider||'',operator:r?.operator||'',checked_at:r?.checked_at||null,cents:state==='Confirmado'?r.cents:null});
 }
 const dates=sources.map(s=>s.checked_at).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b));
 return{ok:true,checked_at:dates[0]||null,source:'Árya + Link Solutions',providers,device_count:devices.length,chip_count:chips.size,missing,duplicates,confirmed,not_found:notFound,inactive,without_price:withoutPrice,conflicts,pending,total_cents:total,complete:!incomplete&&missing===0&&notFound===0&&withoutPrice===0&&conflicts===0&&pending===0,groups:[...groups.values()].sort((a,b)=>b.count-a.count),items};
}
