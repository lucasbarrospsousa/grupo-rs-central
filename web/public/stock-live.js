import {gpsOutdated} from './gps-status.js';
import {consultationHtml} from './stock-consultation.js';
import {watchStockPause} from './stock-pause.js';
import {stockRounds} from './stock-rounds.js';
import {visibleStockQueue} from './visible-stock.js';
import {showStockLocation} from './stock-location.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
import {communication,latestCommunication} from './communication-state.js';
export {communication} from './communication-state.js';
export function createStockLive({repo,branch,draw,showModal}){
 if(repo.stockMonitor?.branch===branch&&repo.stockMonitor.user===repo.user){repo.stockMonitor.attach({draw,showModal});return repo.stockMonitor;}
 repo.stockMonitor?.close();
 let root=document.querySelector('#stock-body'),heading=document.querySelector('.stock-card-heading small');
 const user=repo.user;
 const attach=view=>{draw=view.draw;showModal=view.showModal;root=document.querySelector('#stock-body');heading=document.querySelector('.stock-card-heading small');};
 const cache=repo.stockSamples||(repo.stockSamples=new Map());
 const samples=cache.get(branch)||new Map();cache.set(branch,samples);let paused=false;
 const observed=row=>{const data=samples.get(row?.id)||row?.observation;return data?{...data,equipment:{...localEquipment(row.id),...data.equipment}}:null;};
 const visible=()=>[...root.querySelectorAll('[data-detail]')].map(b=>b.dataset.detail);
 const progress=(state,{completed=0,total=0}={})=>{if(!root.isConnected)return;heading.textContent=state==='interval'?'Rodada concluída · '+total+' aparelhos':state==='waiting'?'Aguardando 1,3 s para consultar':state==='paused'?'Consultas pausadas':state==='empty'?'Nenhum aparelho nesta página':completed<total?'Consultando '+(completed+1)+' de '+total+' aparelhos':'Concluindo a rodada';const meter=document.querySelector('#stock-query-progress');if(meter){meter.max=Math.max(1,total);meter.value=completed;}};
 const localEquipment=id=>{const r=repo.list(branch).find(x=>x.id===id)||{};return{serial:r.serial,iccid:r.iccid,phone:r.phone,apn:r.apn,plate:r.plate,carrier:r.carrier};};
 const adopt=item=>{if(item?.device?.status==='Instalado'){const current=repo.devices.find(d=>d.id===item.id);if(current?.status==='Instalado'&&item.device.version>current.version){Object.assign(current,item.device);samples.delete(item.id);}}};
 const merged=id=>samples.get(id)||{equipment:localEquipment(id),location:{},chip:{}};
 const rounds=stockRounds({query:(id,kind,signal)=>{if(repo.user!==user||repo.currentBranch&&repo.currentBranch!==branch){rounds.close();throw Error('Sessão ou filial alterada.');}return repo.request('integrations/stock-page?'+new URLSearchParams({branch,kind,ids:id}),{signal}).catch(error=>{if([401,403].includes(error.status))rounds.close();throw error;});},onState:progress,onStart:(id,kind)=>{const field=kind==='chips'?'chip':'location',previous=merged(id);samples.set(id,{...previous,[field]:{...previous[field],pending:true},equipment:localEquipment(id)});if(root.isConnected)draw();},onResult:(id,kind,data)=>{const field=kind==='chips'?'chip':'location';for(const item of data.results||[]){adopt(item);const previous=merged(item.id);samples.set(item.id,{...previous,[field]:field==='location'?latestCommunication(previous[field],item.ok?item[field]:{ok:false,message:item.message}):item.ok?item[field]:{ok:false,message:item.message},[field+'CheckedAt']:Date.now(),queried_at:data.queried_at});}if(root.isConnected)draw();}});
 const fetchRow=async (id,signal)=>{const response=await repo.request('integrations/stock-page?'+new URLSearchParams({branch,kind:'locations',ids:id}),{signal});const item=response.results[0];adopt(item);return{...merged(id),location:item.ok?item.location:{ok:false,message:item.message},equipment:localEquipment(id),queried_at:response.queried_at};};
 function refresh(force=false){if(root.isConnected){const ids=visible();if(samples.size>200)for(const id of samples.keys())if(!ids.includes(id))samples.delete(id);rounds.set(ids,{force});}}
 const visibility=()=>rounds.pause(paused||navigator.onLine===false);
 const stopWatching=watchStockPause(value=>{paused=value;visibility();});
 window.addEventListener('online',visibility);window.addEventListener('offline',visibility);visibility();
 const close=()=>{stopWatching();rounds.close();window.removeEventListener('online',visibility);window.removeEventListener('offline',visibility);};
 async function updateEquipment(){const ids=visible();if(!ids.length)return{updated:0,failed:0};const result={results:[]};for(let at=0;at<ids.length;at+=10){if(repo.user!==user)throw Error('Sessão encerrada.');const batch=await repo.request('integrations/equipment-refresh?'+new URLSearchParams({branch}),{method:'POST',body:{ids:ids.slice(at,at+10)}});result.results.push(...batch.results);}repo.invalidate?.(branch,['warehouse']);for(const item of result.results){if(item.ok){const stored=repo.devices.find(x=>x.id===item.id);if(stored&&item.device.version>=stored.version)Object.assign(stored,item.device);samples.set(item.id,{...merged(item.id),equipment:localEquipment(item.id),chip:{pending:true}});}}if(root.isConnected){draw();refresh(true);}return{updated:result.results.filter(x=>x.ok).length,failed:result.results.filter(x=>!x.ok).length,errors:result.results.filter(x=>!x.ok).map(x=>({serial:repo.devices.find(d=>d.id===x.id)?.serial,message:x.message}))};}
 return repo.stockMonitor={branch,user,attach,close,refresh,suspend:()=>rounds.suspend(),updateEquipment,decorate:rows=>rows.map(r=>{const data=samples.get(r.id);if(!data)return {...r,gpsOutdated:gpsOutdated(r.observation?.location),communication:'Aguardando consulta',connectivity:'Aguardando consulta'};return{...r,gpsOutdated:gpsOutdated(data.location),communication:data.location?.pending&&!data.location?.ok?'Consultando…':communication(data.location),connectivity:data.chip?.pending?'Consultando…':data.chip?.ok&&data.chip.iccid===r.iccid?data.chip.connectivity||'Não informado':'Consulta pendente'};}),
 details(id,location=false){const row=repo.list(branch).find(r=>r.id===id),data=observed(row);if(location)return showStockLocation({row,data,showModal,queryOwner:()=>repo.request('integrations/stock-owner?'+new URLSearchParams({branch,serial:row.serial})),swap:(repo.user?.permissions?.owner||repo.user?.permissions?.writes?.includes('stock'))?{serial:row.serial,request:body=>repo.request('integrations/equipment-swap?'+new URLSearchParams({branch,serial:row.serial}),body?{method:'POST',body}:{}),done:async()=>{samples.clear();if(root.isConnected)draw();}}:null,query:signal=>fetchRow(id,signal),onData:value=>{samples.set(id,{...value,locationCheckedAt:Date.now()});if(root.isConnected)draw();}});showModal('Consulta do aparelho • '+esc(row.serial),consultationHtml(data),'medium');}

 };
}
