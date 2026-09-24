import {positionMap} from './maps.js';
import {validPoint} from './tracking-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function showStockLocation({row,data,showModal,query,onData}){
 showModal('Localização do veículo',`<section class="stock-location"><p>Última posição e informações do rastreador • ${esc(row.serial)}</p><div class="stock-location-grid"><div><div class="detail-list" id="position-owner"></div><div id="position-map" class="stock-location-map"></div><div class="toolbar"><button id="position-plus" aria-label="Aumentar zoom">+</button><button id="position-minus" aria-label="Diminuir zoom">−</button><button id="position-center">Centralizar</button><a id="position-external" target="_blank" rel="noopener noreferrer" hidden>Abrir no Maps</a></div><p id="position-state" role="status"></p></div><aside><h3>Última comunicação</h3><div id="position-info" class="detail-list"></div></aside></div><div class="toolbar"><button id="position-refresh" class="primary">Atualizar localização</button><button id="position-copy">Copiar coordenadas</button><button id="position-close">Fechar</button></div></section>`,'');
 const modal=document.querySelector('#modal'),host=modal.querySelector('.stock-location');let map=null,point=null,busy=false,revision=0;
 const el=id=>host.querySelector('#position-'+id);
 const field=(label,value)=>`<div>${label}<b>${esc(value===undefined||value===null||value===''?'Não informado':value)}</b></div>`;
 async function display(sample){
  const version=++revision,loc=sample?.location||{},equipment=sample?.equipment||{};
  el('owner').innerHTML=field('Cliente',loc.client||equipment.client||row.client)+field('Placa / identificação',loc.plate||equipment.plate||row.plate);
  el('info').innerHTML=field('Recebida em',loc.updated_at)+field('Data GPS',loc.gps_at)+field('Ignição',/^(1|true|on|ligad[oa])$/i.test(String(loc.ignition))?'Ligada':/^(0|false|off|desligad[oa])$/i.test(String(loc.ignition))?'Desligada':loc.ignition)+field('Bateria',loc.battery)+field('Velocidade',loc.speed)+field('Fonte',loc.source||sample?.source)+field('Consultado em',sample?.queried_at);
  point=loc.ok&&validPoint(loc)?loc:null;
  for(const name of ['plus','minus','center','copy'])el(name).disabled=!point;
  el('external').hidden=!point;el('external').removeAttribute('href');
  if(map){map.dispose();map=null;}el('map').replaceChildren();
  if(!point){el('map').textContent='Coordenadas não disponíveis para este aparelho.';el('state').textContent=loc.message||'A plataforma ainda não confirmou uma posição válida.';return;}
  el('external').href=`https://www.google.com/maps?q=${+point.lat},${+point.lng}`;
  el('state').textContent='Última posição recebida • arraste para mover e use a roda do mouse para ampliar.';
  try{const result=await positionMap(el('map'),[point],{pin:true,isCurrent:()=>version===revision&&modal.open});if(version!==revision||!host.isConnected||!modal.open){result?.dispose();return;}map=result;}catch(error){if(host.isConnected)el('state').textContent='Mapa indisponível: '+error.message;}
 }
 async function refresh(){if(busy)return;busy=true;el('refresh').disabled=true;el('state').textContent='Consultando plataforma e chip…';try{const result=await query();onData(result);if(host.isConnected&&modal.open)await display(result);}catch(error){if(host.isConnected)el('state').textContent='Consulta pendente: '+error.message;}finally{busy=false;if(host.isConnected)el('refresh').disabled=false;}}
 el('refresh').onclick=refresh;el('plus').onclick=()=>map?.map.zoomIn();el('minus').onclick=()=>map?.map.zoomOut();el('center').onclick=()=>map?.fit();el('close').onclick=()=>modal.close();
 el('copy').onclick=async()=>{if(!point)return;try{await navigator.clipboard.writeText(`${+point.lat}, ${+point.lng}`);el('state').textContent='Coordenadas copiadas.';}catch{el('state').textContent=`Coordenadas: ${+point.lat}, ${+point.lng}`;}};
 modal.addEventListener('close',()=>{revision++;map?.dispose();map=null;},{once:true});
 void display(data);void refresh();
}
