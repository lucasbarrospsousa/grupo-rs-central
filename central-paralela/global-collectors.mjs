import {normalize} from './integrations.mjs';
import {aryaCostSnapshot,linkCostSnapshot} from './provider-costs.mjs';
import {queryStatus,latestLocation} from './query-flow.mjs';

export const collectorIntervals={warehouse:3600000,costs:1800000,codes:86400000,'warehouse-links':86400000,'global-status':900000,maintenance:86400000};
const compact=v=>String(v||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
export function chipPage(data,skip){
 if(data?.ok!==true||!Array.isArray(data.equipamentos)||typeof data.paginacao?.temMais!=='boolean')throw Error('Página não confirmada');
 const more=data.paginacao.temMais,next=data.paginacao.proximoSkip;
 if(data.equipamentos.length>50||more&&(!Number.isInteger(next)||next<=skip||!data.equipamentos.length))throw Error('Paginação inválida');
 // Inactive inventory cannot establish a current chip link. Filter it before
 // validating serials; legacy inactive entries may carry unsupported identifiers.
 const rows=data.equipamentos.filter(r=>!['I','INATIVO','0'].includes(String(r?.ativo??'').trim().toUpperCase())).map(r=>{const n=normalize(r);if(!n.serial)throw Error('Série ausente');return {serial:n.serial,iccid:/^89\d{17,18}$/.test(n.iccid)?n.iccid:''};});
 if(new Set(rows.map(r=>r.serial)).size!==rows.length)throw Error('Séries repetidas');
 return {rows,more,next};
}
export function reconcileChips(store,items,provider,at){
 const map=new Map(items.map(r=>[r.iccid,r]));
 for(const r of store.rows||[]){if(r.deleted_at||r.kind!=='chip'||r.status!=='Disponível'||r.chip_provider!==provider)continue;
  const item=map.get(r.serial);if(!item||item.found===false)continue;
  const state=String(item.status||'').toUpperCase();
  if(['PENDENTE','PENDING'].includes(state))r.classification='Reserva';
  else if(item.active===true&&['ATIVO','ATIVO - NUNCA CONECTADO','VINCULADO'].includes(state)&&r.classification==='Reserva')r.classification='Estoque';
  Object.assign(r,{chip_status:item.status,chip_operator:item.operator,checked_at:at,version:(r.version||0)+1});
  if(item.phone&&/^\+?\d{8,20}$/.test(item.phone))r.chip_phone=item.phone;
 }
}
// One bounded unit per alarm; checkpoint and evidence live in the same Drive save.
export async function collect({job,document,service,now=Date.now()}){
 const doc=await document(job.branch),d=doc.data,at=new Date(now).toISOString();
 d.collectors??={};const checkpoint=d.collectors[job.kind]??={};
 const active=d.rows.filter(r=>!r.deleted_at).sort((a,b)=>a.serial.localeCompare(b.serial));
 let finished=true;
 if(['codes','global-status','maintenance'].includes(job.kind)){
  const selected=job.kind==='global-status'?active.filter(r=>r.status==='Estoque'||job.branch!=='imperatriz'&&r.status==='Reserva'):job.kind==='maintenance'?active.filter(r=>['Manutenção','Reparo'].includes(r.status)):active;
  const row=selected.find(r=>r.serial>(checkpoint.after||''));
  if(row){
   try {
   if(job.kind==='codes'){
    const e=await service.equipment(job.branch,row.serial);if(!e.ok||e.serial!==row.serial||!/^[1-9]\d*$/.test(e.id||''))throw Error('Identidade não confirmada');
    if(e.vehicle_id&&(!/^[1-9]\d*$/.test(e.vehicle_id)||!e.plate))throw Error('Veículo não confirmado');
    const state=e.vehicle_id?(compact(e.plate)===compact(row.plate)?'confirmed':'divergent'):e.binding_known&&!e.plate?'unlinked':null;if(!state)throw Error('Vínculo não confirmado');
    row.code_scan={state,equipment_id:e.id,vehicle_id:e.vehicle_id||null,api_plate:e.plate||'',checked_at:at};
    if(e.vehicle_id)row.api_codes={branch:job.branch,serial:row.serial,equipment_id:e.id,vehicle_id:e.vehicle_id};else delete row.api_codes;
    if(e.apn)row.apn=e.apn;
    if(e.vehicle_id&&typeof service.vehicles==='function'){
     const vehicles=await service.vehicles(job.branch,row.serial,{equipment:e});let v=vehicles.length===1?vehicles[0]:null;
     if(v&&!v.client&&Number(v.owner_count)<=1&&row.client&&typeof service.associationOwner==='function'){const owner=await service.associationOwner(job.branch,v,row.client);if(owner)v={...v,...owner};}
     if(v&&v.serial===row.serial&&String(v.vehicle_id)===String(e.vehicle_id)&&compact(v.plate)===compact(e.plate)&&(!v.equipment_id||String(v.equipment_id)===String(e.id))&&/^[1-9]\d*$/.test(v.client_id||'')&&v.client&&Number(v.owner_count)<=1)row.confirmed_owner={branch:job.branch,serial:row.serial,client:v.client,client_id:v.client_id,plate:v.plate,vehicle_id:e.vehicle_id,equipment_id:e.id,checked_at:at};
     else delete row.confirmed_owner;
    }
   }else{
    const chip=job.kind==='global-status'&&(!row.live?.chip?.queried_at||now-Date.parse(row.live.chip.queried_at)>=3600000);
    const result=await queryStatus(service,job.branch,row,{chip});
    if(!result.location.ok)throw Error('Comunicação não confirmada');
    if(job.kind==='maintenance'){
     if(!compact(row.plate)||result.location.serial!==row.serial||compact(result.location.plate)!==compact(row.plate))throw Error('Placa não confirmada');
     const ignition=String(result.location.ignition).toLowerCase();
     if(!['1','0','true','false','on','off','ligado','desligado'].includes(ignition))throw Error('Ignição não confirmada');
     row.maintenance_watch={ignition:['1','true','on','ligado'].includes(ignition)?'on':'off',communication_at:result.location.updated_at,checked_at:at};
    }
    result.location=latestLocation(row.live?.location,result.location);row.live=result;
   }
   delete row.collector_error;
   }catch(e){
    if(e.credentialInvalid||e.automaticDeferred||e.status===429||e.upstreamStatus===429||e.upstreamStatus===403)throw e;
    row.collector_error={kind:job.kind,message:'Consulta não confirmada; dados anteriores preservados',checked_at:at};
   }
   checkpoint.after=row.serial;finished=!selected.some(r=>r.serial>row.serial);
  }
 }else if(job.kind==='warehouse-links'){
  const branches=['imperatriz','araguaina','acailandia','maraba'],sourceBranch=branches[checkpoint.base||0];
  const skip=checkpoint.skip||0,page=chipPage(await service.api(sourceBranch,'/equipamentos?skip='+skip+'&take=50'),skip);
  const staged=checkpoint.staged||[];
  if(page.rows.some(r=>staged.some(s=>s.serial===r.serial&&s.branch===sourceBranch)))throw Error('Página repetida; revisão necessária');
  staged.push(...page.rows.map(r=>({...r,branch:sourceBranch})));if(staged.length>20000)throw Error('Limite de inventário');
  finished=!page.more&&sourceBranch==='maraba';
  if(finished){
   for(const branch of branches){const target=branch===job.branch?doc:await document(branch);
    for(const chip of target.data.warehouse?.rows||[]){if(chip.kind!=='chip'||chip.deleted_at)continue;const matches=staged.filter(r=>r.iccid&&r.iccid===chip.serial),one=matches.length===1?matches[0]:null;
     chip.chip_link_result={state:matches.length>1?'conflict':!one?'not_found':chip.usage_device_serial&&(chip.usage_device_serial!==one.serial||chip.usage_branch!==one.branch)?'divergent':'confirmed',serial:one?.serial||null,branch:one?.branch||null,checked_at:at,source:'API RS • quatro bases'};
    }if(branch!==job.branch)await target.save();
   }
   d.equipmentInventory={rows:staged,checked_at:at};delete checkpoint.staged;delete checkpoint.skip;delete checkpoint.base;
  }else {checkpoint.staged=staged;checkpoint.skip=page.more?page.next:0;checkpoint.base=page.more?(checkpoint.base||0):(checkpoint.base||0)+1;}
 }else if(['warehouse','costs'].includes(job.kind)){
  const store=d.warehouse??={rows:[],movements:[],audit:[]};store.providerSnapshots??={};
  const provider=checkpoint.provider||'arya',snapshotKey=job.kind==='costs'?provider+'-global':provider,previous=store.providerSnapshots[snapshotKey];
  if(!previous?.checked_at||now-Date.parse(previous.checked_at)>=collectorIntervals[job.kind]){
   let snapshot;
   if(provider==='arya')snapshot=await aryaCostSnapshot(service,{maxAgeMs:1800000});
   else{
    const sources=job.kind==='costs'?await Promise.all(['imperatriz','araguaina','acailandia','maraba'].map(b=>b===job.branch?{data:d}:document(b))):[{data:d}];
    const discovered=sources.flatMap(({data})=>[...data.rows.filter(r=>!r.deleted_at&&r.apn==='linksolutions.br').map(r=>r.iccid),...(data.warehouse?.rows||[]).filter(r=>!r.deleted_at&&r.kind==='chip'&&r.chip_provider==='link').map(r=>r.serial)]);
    const ids=checkpoint.ids||[...new Set(discovered)].filter(x=>/^89\d{17,18}$/.test(x)).sort();checkpoint.ids=ids;
    const offset=checkpoint.offset||0,batch=ids.slice(offset,offset+100);
    snapshot=batch.length?await linkCostSnapshot(service,batch):{rows:new Map(),checked_at:at};
    const staged={...(checkpoint.items||{}),...Object.fromEntries(snapshot.rows)};
    if(offset+100<ids.length){Object.assign(checkpoint,{provider,offset:offset+100,items:staged});await doc.save();return {finished:false};}
    snapshot.rows=new Map(Object.entries(staged));delete checkpoint.offset;delete checkpoint.items;delete checkpoint.ids;
   }
   store.providerSnapshots[snapshotKey]={items:[...snapshot.rows.values()],checked_at:snapshot.checked_at};
  }
  const source=store.providerSnapshots[snapshotKey];if(source)reconcileChips(store,source.items,provider,source.checked_at);
  const providers=Object.entries(store.providerSnapshots).filter(([name])=>name.endsWith('-global')).map(([name,s])=>({name:name.replace('-global',''),missing_count:s.items.filter(i=>i.found===false||i.active&&!Number.isSafeInteger(i.cents)).length,checked_at:s.checked_at,active_count:s.items.filter(i=>i.active).length,total_cents:s.items.filter(i=>i.active&&Number.isSafeInteger(i.cents)).reduce((n,i)=>n+i.cents,0)}));
  if(job.kind==='costs')store.costs={...store.costs,providers,active_count:providers.reduce((n,p)=>n+p.active_count,0),total_cents:providers.reduce((n,p)=>n+p.total_cents,0),complete:providers.length===2&&providers.every(p=>p.missing_count===0),missing_count:providers.reduce((n,p)=>n+p.missing_count,0),sourceAt:at};
  finished=provider==='link';checkpoint.provider=finished?'arya':'link';
 }
 checkpoint.updatedAt=at;if(finished){delete checkpoint.after;checkpoint.completedAt=at;}
 await doc.save();return {finished};
}
