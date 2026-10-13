// Read-only inventory export: one request covers the account, never one per SIM.
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
export function summarizeCosts(devices,snapshot){
 const chips=new Map();let missing=0,duplicates=0;
 for(const d of devices){const iccid=String(d.iccid||'').trim();if(!/^89\d{17,18}$/.test(iccid)){missing++;continue;}if(chips.has(iccid)){duplicates++;chips.get(iccid).devices.push(d.serial);}else chips.set(iccid,{iccid,devices:[d.serial]});}
 let total=0,confirmed=0,notFound=0,inactive=0,withoutPrice=0;const groups=new Map(),items=[];
 for(const chip of chips.values()){const r=snapshot.rows.get(chip.iccid);let state;
 if(!r){notFound++;state='Não localizado na Árya';}else if(!r.active){inactive++;state='Não ativo na Árya';}else if(r.cents===null){withoutPrice++;state='Mensalidade não informada';}else{state='Confirmado';confirmed++;total+=r.cents;const key=r.operator+'|'+r.cents;const g=groups.get(key)||{operator:r.operator,cents:r.cents,count:0};g.count++;groups.set(key,g);}
 items.push({...chip,state,operator:r?.operator||'',cents:state==='Confirmado'?r.cents:null});}
 return{ok:true,checked_at:snapshot.checked_at,source:'Árya • Valor negociado',device_count:devices.length,chip_count:chips.size,missing,duplicates,confirmed,not_found:notFound,inactive,without_price:withoutPrice,total_cents:total,complete:missing===0&&notFound===0&&withoutPrice===0,groups:[...groups.values()].sort((a,b)=>b.count-a.count),items};
}
