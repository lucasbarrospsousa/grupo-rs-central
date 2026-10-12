import {mountEquipmentSwap} from './equipment-swap.js';
import {communicationAge,communicationStatus,ignitionLabel,latestCommunication} from './communication-state.js';
import {positionMap} from './maps.js';
import {validPoint} from './tracking-model.js';
import {gpsStatus} from './gps-status.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function markerColor(loc){const label=ignitionLabel(loc?.ignition);return label==='Ligado'?'#129568':label==='Desligado'?'#d62f49':'#728397';}
export function locationPopup(loc){
 const gps=gpsStatus(loc),age=communicationAge(loc),node=document.createElement('div');node.className='location-pin-popup';
 node.innerHTML='<strong style="background:'+markerColor(loc)+'">'+esc(loc.plate||'Sem identificação')+'</strong><div><small>Série</small><b>'+esc(loc.serial||'Não informada')+'</b><p>Última ignição: '+esc(ignitionLabel(loc.ignition))+'</p><small>Última comunicação</small><b>'+esc(locationTime(loc.updated_at))+'</b><small>'+(age?'Há '+esc(age):'Horário não informado')+'</small>'+(gps.tone==='warning'?'<em>'+esc(gps.label)+'</em>':'')+'</div>';return node;
}
const detail=(label,value)=>'<div class="location-detail"><span>'+label+'</span><strong>'+esc(value)+'</strong></div>';
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
export function showStockLocation({row,data,showModal,query,onData,swap}){
 showModal('Localização do aparelho','<section class="stock-location"><div class="location-identity" id="position-owner"></div><div class="stock-location-grid"><div id="position-map" class="stock-location-map"></div><aside id="position-info" aria-label="Comunicação do aparelho"></aside></div><footer class="location-footer"><button id="position-center">Centralizar</button><a id="position-external" target="_blank" rel="noopener noreferrer" hidden>Abrir no Maps</a><button id="position-refresh" aria-label="Atualizar localização">↻ Atualizar</button><small>Atualização a cada 15 s</small><span id="position-state" role="status"></span></footer><section id="equipment-swap" hidden></section></section>','location-dialog');
 const modal=document.querySelector('#modal'),host=modal.querySelector('.stock-location');let map=null,point=null,busy=false,revision=0,mapKey='',sample=data;const controller=new AbortController();
 const swapHost=host.querySelector('#equipment-swap');if(swap)swapHost.hidden=false;const stopSwap=swap?mountEquipmentSwap(swapHost,{...swap,done:async()=>{await swap.done?.();sample={};await display({location:{ok:false,message:'Troca concluída. Aguardando consulta do novo vínculo.'}});await refresh();}}):()=>{};
 const el=id=>host.querySelector('#position-'+id);
 function displayOwner(){
  const loc=sample?.location||{},equipment=sample?.equipment||{};
  el('owner').innerHTML='<strong>'+esc(loc.plate||equipment.plate||row.plate||'Sem identificação')+'</strong><span>Série '+esc(row.serial)+'</span>';
 }
 async function display(next){
  sample={...next,location:latestCommunication(sample?.location,next?.location)};
  const version=++revision,loc=sample?.location||{},gps=gpsStatus(loc);
  displayOwner();
  const ignition=ignitionLabel(loc.ignition),status=communicationStatus(loc);
  el('info').innerHTML='<h3>Estado do aparelho</h3><div class="location-ignition" style="color:'+markerColor(loc)+'">Última ignição: '+esc(ignition)+'</div>'+(status.possibleSleep?'<div class="location-sleep"><strong>Possível repouso</strong><small>Hipótese; repouso não confirmado.</small></div>':'')+detail('Último evento',locationTime(loc.gps_at))+detail('Bateria externa',internalBattery(loc.battery,' V'))+'<div class="location-detail"><span>'+esc(internalBatteryDetails(loc))+'</span></div><div class="location-gps '+esc(gps.tone)+'"><strong>'+esc(gps.label)+'</strong><small>'+esc(gps.detail)+'</small></div>';
  loc.serial=row.serial;loc.plate=loc.plate||sample.equipment?.plate||row.plate;


  point=loc.ok&&validPoint(loc)?loc:null;el('center').disabled=!point;el('external').hidden=!point;el('external').removeAttribute('href');
  const nextKey=point?point.lat+','+point.lng:'';if(map&&mapKey===nextKey){map.select(point,{pan:false});el('external').href='https://www.google.com/maps?q='+Number(point.lat)+','+Number(point.lng);el('state').textContent='';return;}mapKey=nextKey;
  if(map){map.dispose();map=null;}el('map').replaceChildren();
  if(!point){el('map').textContent='Coordenadas não disponíveis para este aparelho.';el('info').insertAdjacentHTML('beforeend',detail('Última comunicação',locationTime(loc.updated_at)));el('state').textContent=loc.message||'';return;}
  el('external').href='https://www.google.com/maps?q='+Number(point.lat)+','+Number(point.lng);el('state').textContent='';
  try{const result=await positionMap(el('map'),[point],{pin:true,pinColor:markerColor,popup:locationPopup,openPopup:true,isCurrent:()=>version===revision&&modal.open});if(version!==revision||!host.isConnected||!modal.open){result?.dispose();return;}map=result;}catch(error){if(host.isConnected)el('state').textContent='Mapa indisponível: '+error.message;}
 }
 async function refresh(){if(busy||controller.signal.aborted||!modal.open||!host.isConnected)return;busy=true;el('refresh').disabled=true;el('state').textContent='Consultando comunicação…';try{const result=await query(controller.signal);if(controller.signal.aborted||!host.isConnected||!modal.open)return;await display(result);if(controller.signal.aborted||!host.isConnected||!modal.open)return;onData(sample);if(sample.location?.query_error)el('state').textContent='Último estado conhecido • '+sample.location.query_error;}catch(error){if(host.isConnected&&!controller.signal.aborted)el('state').textContent='Último estado conhecido • Consulta pendente: '+error.message;}finally{busy=false;if(host.isConnected)el('refresh').disabled=false;}}
 el('refresh').onclick=()=>{void refresh();};el('center').onclick=()=>map?.fit();let stopped=false;
 const timer=setInterval(()=>{if(!host.isConnected||!modal.open){stop();return;}if(!document.hidden&&navigator.onLine!==false)void refresh();},15000);
 function stop(){if(stopped)return;stopped=true;stopSwap();clearInterval(timer);observer.disconnect();controller.abort();revision++;map?.dispose();map=null;modal.removeEventListener('close',stop);}
 const observer=new MutationObserver(()=>{if(!host.isConnected||!modal.open)stop();});observer.observe(modal,{childList:true});
 modal.addEventListener('close',stop,{once:true});void display(data);if(!data?.location?.ok||!validPoint(data.location))void refresh();
}
