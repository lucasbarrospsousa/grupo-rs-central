import {watchStockPause} from './stock-pause.js';
import {pageBatch} from './page-batch.js';
import {visibleStockQueue} from './visible-stock.js';
import {showStockLocation} from './stock-location.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function communication(sample,now=Date.now()){
 if(!sample?.ok)return sample?.message?'Consulta pendente':'Não consultado';
 const parse=v=>{const s=String(v||'').replace(' ','T');return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(s)?s+'-03:00':s);};
 const at=parse(sample.updated_at),gps=parse(sample.gps_at),ign=String(sample.ignition).toLowerCase(),off=['0','false','off','desligado'].includes(ign),on=['1','true','on','ligado'].includes(ign);
 if(!Number.isFinite(at))return 'Data não informada';
 if(now-at>(off?3600000:600000))return 'Desatualizado';
 if(!Number.isFinite(gps)||at-gps>7200000)return 'Possível GPS';
 return off?'Desligado':on?'Atualizado':'Ignição não informada';
}
export function createStockLive({repo,branch,draw,showModal}){
 const root=document.querySelector('#stock-body'),heading=document.querySelector('.stock-card-heading small');
 const samples=new Map();let paused=false;
 const observed=row=>samples.get(row?.id)||row?.observation;
 const visible=()=>[...root.querySelectorAll('[data-detail]')].map(b=>b.dataset.detail);
 const progress=()=>{if(root.isConnected)heading.textContent=`Localização: página de até 10 • a cada 1 min • chips independentes`;};
 const localEquipment=id=>{const r=repo.list(branch).find(x=>x.id===id)||{};return{serial:r.serial,iccid:r.iccid,phone:r.phone,apn:r.apn,plate:r.plate,carrier:r.carrier};};
 const merged=id=>samples.get(id)||{equipment:localEquipment(id),location:{},chip:{}};
 function batch(kind,field){return pageBatch({query:(ids,signal)=>repo.request('integrations/stock-page?'+new URLSearchParams({branch,kind,ids:ids.join(',')}),{signal}),onStart:ids=>{for(const id of samples.keys())if(!ids.includes(id))samples.delete(id);for(const id of ids){const previous=merged(id);samples.set(id,{...previous,[field]:{pending:true},equipment:localEquipment(id)});}if(root.isConnected)draw();},onResult:data=>{for(const item of data.results){const previous=merged(item.id);samples.set(item.id,{...previous,[field]:item.ok?item[field]:{ok:false,message:item.message},queried_at:data.queried_at});}if(root.isConnected)draw();},onError:(error,ids)=>{for(const id of ids)samples.set(id,{...merged(id),[field]:{ok:false,message:error.message}});if(root.isConnected)draw();}});}
 const locations=batch('locations','location'),chips=batch('chips','chip');
 const fetchRow=async id=>{const response=await repo.request('integrations/stock-page?'+new URLSearchParams({branch,kind:'locations',ids:id}));const item=response.results[0];return{...merged(id),location:item.ok?item.location:{ok:false,message:item.message},equipment:localEquipment(id),queried_at:response.queried_at};};
 function refresh(force=false){if(!paused&&root.isConnected){const ids=visible();locations.run(ids,{force});chips.run(ids,{force});progress();}}
 const timer=setInterval(()=>{if(!paused&&root.isConnected&&!document.hidden&&navigator.onLine!==false)locations.run(visible(),{force:true});},60000);
 const chipTimer=setInterval(()=>{if(!paused&&root.isConnected&&!document.hidden&&navigator.onLine!==false)chips.run(visible(),{force:true});},180000);
 const stopWatching=watchStockPause(value=>{const was=paused;paused=value;if(value){locations.invalidate();chips.invalidate();if(root.isConnected)heading.textContent='Consultas da lista pausadas • análise de baixa em andamento';}else if(was)refresh(true);});
 const observer=new MutationObserver(()=>{if(!root.isConnected){stopWatching();locations.close();chips.close();clearInterval(timer);clearInterval(chipTimer);observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
 async function updateEquipment(){const ids=visible();if(!ids.length)return{updated:0,failed:0};const result=await repo.request('integrations/equipment-refresh?'+new URLSearchParams({branch}),{method:'POST',body:{ids}});repo.invalidate?.(branch,['warehouse']);for(const item of result.results){if(item.ok){const stored=repo.devices.find(x=>x.id===item.id);if(stored&&item.device.version>=stored.version)Object.assign(stored,item.device);samples.set(item.id,{...merged(item.id),equipment:localEquipment(item.id),chip:{pending:true}});}}if(root.isConnected){draw();chips.invalidate();if(!paused)chips.run(visible(),{force:true});}return{updated:result.results.filter(x=>x.ok).length,failed:result.results.filter(x=>!x.ok).length,errors:result.results.filter(x=>!x.ok).map(x=>({serial:repo.devices.find(d=>d.id===x.id)?.serial,message:x.message}))};}
 return{refresh,updateEquipment,decorate:rows=>rows.map(r=>{const data=samples.get(r.id);if(!data)return {...r,communication:'Consultando…',connectivity:'Consultando…'};return{...r,communication:data.location?.pending?'Consultando…':communication(data.location),connectivity:data.chip?.pending?'Consultando…':data.chip?.ok&&data.chip.iccid===r.iccid?data.chip.connectivity||'Não informado':'Consulta pendente'};}),
 details(id,location=false){const row=repo.list(branch).find(r=>r.id===id),data=observed(row);if(location)return showStockLocation({row,data,showModal,query:()=>fetchRow(id),onData:value=>{samples.set(id,value);if(root.isConnected)draw();}});const field=(label,v)=>`<div>${label}<b>${esc(v||'Não informado')}</b></div>`;
 showModal('Consulta do aparelho • '+esc(row.serial),data?`<h3>Plataforma</h3><div class="detail-list">${field('Resultado',data.location.ok?'Consulta confirmada':data.location.message)}${field('Cliente',data.location.client||data.equipment.client)}${field('Placa / identificação',data.equipment.plate)}${field('Última comunicação',data.location.updated_at)}${field('Data GPS',data.location.gps_at)}${field('Ignição',data.location.ignition)}${field('Bateria',data.location.battery)}</div><h3>Chip</h3><div class="detail-list">${field('ICCID',data.equipment.iccid)}${field('Telefone',data.chip.phone||data.equipment.phone)}${field('Consulta',data.chip.ok?data.chip.provider:data.chip.message)}${field('Conectividade',data.chip.connectivity)}${field('Situação cadastral',data.chip.status)}${field('Consultado em',data.queried_at)}</div>`:'<p>Consulta em andamento. Aguarde a atualização desta página.</p>','medium');}
 };
}
