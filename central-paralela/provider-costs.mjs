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
 result.set(iccid,{iccid,active:['ATIVO','ATIVO - NUNCA CONECTADO'].includes(get('STATUS')),status:get('STATUS'),cents:brlCents(get('VALOR NEGOCIADO')),operator:get('OPERADORA'),plan:get('PLANO'),imei:get('IMEI'),phone:get('NUMERO'),connection:get('STATUS DE CONEXAO'),last_connection:get('ULTIMA ABERTURA SESSAO'),last_session_update:get('ULTIMA ATUALIZACAO SESSAO')});}
 return result;
}
export async function aryaCostSnapshot(service,{maxAgeMs=30*60*1000}={}){
 let entry=cache.get(service);if(entry&&Date.now()-entry.at<maxAgeMs)return entry.promise;
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
