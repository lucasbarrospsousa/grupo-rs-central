import {communicationAge,ignitionLabel,latestCommunication} from './communication-state.js';
import {positionMap} from './maps.js';
import {validPoint} from './tracking-model.js';
import {gpsStatus} from './gps-status.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={user:'M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',car:'M4 10l2-6h12l2 6M3 10h18v8H3zM6 18v3m12-3v3M6 14h2m8 0h2',chip:'M6 6h12v12H6zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',gps:'M12 22S4 15 4 9a8 8 0 0 1 16 0c0 6-8 13-8 13ZM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',power:'M12 2v10M6 5a9 9 0 1 0 12 0',battery:'M2 6h18v12H2zM20 10h2v4h-2M6 12h6m-3-3v6'};
const icon=k=>'<span class="location-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="'+paths[k]+'"/></svg></span>';
const card=(label,value,k,tone='',detail='')=>'<article class="location-card '+tone+'">'+icon(k)+'<div><span>'+label+'</span><strong>'+esc(value===undefined||value===null||value===''?'Não informado':value)+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</div></article>';
export function internalBattery(value,unit='%'){
 if(value===null||value===undefined||String(value).trim()==='')return 'Não informado';
 const number=Number(value);return Number.isFinite(number)&&number>=0?number.toLocaleString('pt-BR',{maximumFractionDigits:2})+unit:'Não informado';
}
export function internalBatteryDetails(loc){
 const estimated=String(loc.internal_battery_voltage_origin||'').startsWith('estimada');
 return 'Interna: '+internalBattery(loc.internal_battery_voltage,' V')+' · '+internalBattery(loc.internal_battery)+(estimated?' (tensão estimada)':'');
}
export function locationTime(value){
 if(!value)return 'Não informado';let text=String(value).trim().replace(' ','T');if(!/(Z|[+-]\d{2}:?\d{2})$/i.test(text))text+='-03:00';const date=new Date(text);return Number.isNaN(date.getTime())?'Não informado':date.toLocaleString('pt-BR',{timeZone:'America/Fortaleza'});
}
export function showStockLocation({row,data,showModal,query,onData}){
 showModal('Localização do aparelho','<section class="stock-location"><div class="location-identity" id="position-owner"></div><div class="stock-location-grid"><div id="position-map" class="stock-location-map"></div><aside id="position-info" aria-label="Comunicação do aparelho"></aside></div><footer class="location-footer"><button id="position-center">Centralizar</button><a id="position-external" target="_blank" rel="noopener noreferrer" hidden>Abrir no Maps</a><button id="position-refresh" aria-label="Atualizar localização">↻ Atualizar</button><small>Atualização a cada 15 s</small><span id="position-state" role="status"></span></footer></section>','location-dialog');
 const modal=document.querySelector('#modal'),host=modal.querySelector('.stock-location');let map=null,point=null,busy=false,revision=0,mapKey='',sample=data;const controller=new AbortController();
 const el=id=>host.querySelector('#position-'+id);
 function displayOwner(){
  const loc=sample?.location||{},equipment=sample?.equipment||{};
  el('owner').innerHTML=card('Placa / identificação',loc.plate||equipment.plate||row.plate,'car')+card('Número de série',row.serial,'chip');
 }
 async function display(next){
  sample={...next,location:latestCommunication(sample?.location,next?.location)};
  const version=++revision,loc=sample?.location||{},gps=gpsStatus(loc);
  displayOwner();
  const ignition=ignitionLabel(loc.ignition);
  el('info').innerHTML=card('Ignição',ignition,'power',ignition==='Ligado'?'success':'neutral','Último estado recebido')+card('Bateria externa',loc.battery,'battery','',internalBatteryDetails(loc))+card('Horário do evento',locationTime(loc.gps_at),'gps')+card('Última comunicação',locationTime(loc.updated_at),'gps')+card('Sem comunicar há',communicationAge(loc)||'Não informado','gps')+card('Status de GPS',gps.label,'gps',gps.tone,gps.detail);

  point=loc.ok&&validPoint(loc)?loc:null;el('center').disabled=!point;el('external').hidden=!point;el('external').removeAttribute('href');
  const nextKey=point?point.lat+','+point.lng:'';if(map&&mapKey===nextKey){el('state').textContent='';return;}mapKey=nextKey;
  if(map){map.dispose();map=null;}el('map').replaceChildren();
  if(!point){el('map').textContent='Coordenadas não disponíveis para este aparelho.';el('state').textContent=loc.message||'';return;}
  el('external').href='https://www.google.com/maps?q='+Number(point.lat)+','+Number(point.lng);el('state').textContent='';
  try{const result=await positionMap(el('map'),[point],{pin:true,isCurrent:()=>version===revision&&modal.open});if(version!==revision||!host.isConnected||!modal.open){result?.dispose();return;}map=result;}catch(error){if(host.isConnected)el('state').textContent='Mapa indisponível: '+error.message;}
 }
 async function refresh(){if(busy||controller.signal.aborted||!modal.open||!host.isConnected)return;busy=true;el('refresh').disabled=true;el('state').textContent='Consultando comunicação…';try{const result=await query(controller.signal);if(controller.signal.aborted||!host.isConnected||!modal.open)return;await display(result);if(controller.signal.aborted||!host.isConnected||!modal.open)return;onData(sample);if(sample.location?.query_error)el('state').textContent='Último estado conhecido • '+sample.location.query_error;}catch(error){if(host.isConnected&&!controller.signal.aborted)el('state').textContent='Último estado conhecido • Consulta pendente: '+error.message;}finally{busy=false;if(host.isConnected)el('refresh').disabled=false;}}
 el('refresh').onclick=()=>{void refresh();};el('center').onclick=()=>map?.fit();let stopped=false;
 const timer=setInterval(()=>{if(!host.isConnected||!modal.open){stop();return;}if(!document.hidden&&navigator.onLine!==false)void refresh();},15000);
 function stop(){if(stopped)return;stopped=true;clearInterval(timer);observer.disconnect();controller.abort();revision++;map?.dispose();map=null;modal.removeEventListener('close',stop);}
 const observer=new MutationObserver(()=>{if(!host.isConnected||!modal.open)stop();});observer.observe(modal,{childList:true});
 modal.addEventListener('close',stop,{once:true});void display(data);if(!data?.location?.ok||!validPoint(data.location))void refresh();
}
