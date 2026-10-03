import {positionMap} from './maps.js';
import {validPoint} from './tracking-model.js';
import {confirmedIdentity} from './location-identity.js';
import {gpsStatus} from './gps-status.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={user:'M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',car:'M4 10l2-6h12l2 6M3 10h18v8H3zM6 18v3m12-3v3M6 14h2m8 0h2',chip:'M6 6h12v12H6zM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4',gps:'M12 22S4 15 4 9a8 8 0 0 1 16 0c0 6-8 13-8 13ZM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',power:'M12 2v10M6 5a9 9 0 1 0 12 0',battery:'M2 6h18v12H2zM20 10h2v4h-2M6 12h6m-3-3v6'};
const icon=k=>'<span class="location-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="'+paths[k]+'"/></svg></span>';
const card=(label,value,k,tone='',detail='')=>'<article class="location-card '+tone+'">'+icon(k)+'<div><span>'+label+'</span><strong>'+esc(value===undefined||value===null||value===''?'Não informado':value)+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</div></article>';
export function showStockLocation({row,data,showModal,query,queryIdentity,onData}){
 showModal('Localização do aparelho','<section class="stock-location"><div class="location-identity" id="position-owner"></div><div class="stock-location-grid"><div id="position-map" class="stock-location-map"></div><aside id="position-info" aria-label="Comunicação do aparelho"></aside></div><footer class="location-footer"><button id="position-center">Centralizar</button><a id="position-external" target="_blank" rel="noopener noreferrer" hidden>Abrir no Maps</a><button id="position-refresh" aria-label="Atualizar localização">↻ Atualizar</button><span id="position-state" role="status"></span><span id="position-identity-state" role="status"></span></footer></section>','location-dialog');
 const modal=document.querySelector('#modal'),host=modal.querySelector('.stock-location');let map=null,point=null,busy=false,revision=0,sample=data,identity=null,identityError='',identityBusy=false;const controller=new AbortController();
 const el=id=>host.querySelector('#position-'+id);
 function displayOwner(){
  if(!host.isConnected||!modal.open)return;
  const loc=sample?.location||{},equipment=sample?.equipment||{};let confirmed=null,warning=identityError;
  if(identity&&!identity.skipped&&loc.ok)try{confirmed=confirmedIdentity(loc,identity,row.serial);}catch(error){warning=error.message;}
  el('owner').innerHTML=card('Nome',confirmed?.client||loc.client||'Não confirmado','user')+card('Placa',loc.plate||equipment.plate||row.plate,'car')+card('Número de série',row.serial,'chip');
  el('identity-state').textContent=identityBusy?'Consultando titular na web…':warning?'Titular pendente: '+warning:identity?.skipped?identity.message:confirmed?'Titular conferido na web.':identity?'Aguardando comunicação para conferir o titular.':'';
 }
 async function enrich(){
  if(!queryIdentity||identityBusy||controller.signal.aborted)return;identityBusy=true;identityError='';displayOwner();
  try{const result=await queryIdentity(controller.signal);if(!controller.signal.aborted)identity=result;}catch(error){if(!controller.signal.aborted)identityError=error.message;}finally{identityBusy=false;if(!controller.signal.aborted)displayOwner();}
 }
 async function display(next){
  sample=next;
  const version=++revision,loc=sample?.location||{},equipment=sample?.equipment||{},gps=gpsStatus(loc);
  displayOwner();
  const ignition=/^(1|true|on|ligad[oa])$/i.test(String(loc.ignition))?'Ligada':/^(0|false|off|desligad[oa])$/i.test(String(loc.ignition))?'Desligada':'Não informada';
  el('info').innerHTML=card('Status de GPS',gps.label,'gps',gps.tone,gps.detail)+card('Ignição',ignition,'power',ignition==='Ligada'?'success':'neutral')+card('Bateria',loc.battery,'battery');
  point=loc.ok&&validPoint(loc)?loc:null;el('center').disabled=!point;el('external').hidden=!point;el('external').removeAttribute('href');
  if(map){map.dispose();map=null;}el('map').replaceChildren();
  if(!point){el('map').textContent='Coordenadas não disponíveis para este aparelho.';el('state').textContent=loc.message||'';return;}
  el('external').href='https://www.google.com/maps?q='+Number(point.lat)+','+Number(point.lng);el('state').textContent='';
  try{const result=await positionMap(el('map'),[point],{pin:true,isCurrent:()=>version===revision&&modal.open});if(version!==revision||!host.isConnected||!modal.open){result?.dispose();return;}map=result;}catch(error){if(host.isConnected)el('state').textContent='Mapa indisponível: '+error.message;}
 }
 async function refresh(){if(busy)return;busy=true;el('refresh').disabled=true;el('state').textContent='Consultando comunicação…';try{const result=await query(controller.signal);if(controller.signal.aborted||!host.isConnected||!modal.open)return;onData(result);await display(result);}catch(error){if(host.isConnected)el('state').textContent='Consulta pendente: '+error.message;}finally{busy=false;if(host.isConnected)el('refresh').disabled=false;}}
 el('refresh').onclick=()=>{void refresh();void enrich();};el('center').onclick=()=>map?.fit();modal.addEventListener('close',()=>{controller.abort();revision++;map?.dispose();map=null;},{once:true});void display(data);void enrich();if(!data?.location?.ok||!validPoint(data.location))void refresh();
}
