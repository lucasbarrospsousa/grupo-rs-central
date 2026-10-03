import {maintenanceShare} from './maintenance-share.js';
import {mountStockOverview} from './stock-overview.js';
import {filterVehicles} from './domain.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arrow='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 9 7 7 7-7"/></svg>';
const colors=['#ee3452','#ff880a','#e8af08','#12ae68'];
const cache=new Map();
export function mountLiveOverview({repo,showModal,notify,render}){
 const p=document.createElement('section');p.className='live-overview';p.innerHTML=`<section class="panel" id="stock-panorama"></section><div class="grid chart-grid"><section class="panel"><div class="live-heading"><h2>Veículos em manutenção por base</h2><button id="live-refresh">Atualizar manutenções</button></div><span class="pill" id="live-complete">Consultando bases</span><div class="live-progress" id="base-progress" role="status"></div><p class="muted">Percentual da frota ativa • do maior para o menor • clique para ver os veículos</p><div id="base-chart"></div></section><section class="panel live-total"><h3>Total de veículos em manutenção</h3><div class="total" id="base-total">—</div><p class="muted" id="total-note">Aguardando consulta</p></section></div>`;document.querySelector('#page').prepend(p);
 mountStockOverview({repo,host:p.querySelector('#stock-panorama'),showModal,notify,render});
 const results=new Map(),errors=new Map();let running=false;
 function list(base,data){
  let page=0,perPage=8;const collapsed=new Set();
  showModal('Veículos em manutenção',`<div class="live-heading"><div><span class="pill">${esc(base.name)}</span> <span class="pill blue">${data.count} veículos</span></div><small>Consulta da plataforma</small></div><div class="toolbar"><input id="live-search" placeholder="Buscar cliente, placa ou equipamento" aria-label="Buscar veículos"><select id="live-apn" aria-label="APN"><option value="">Todas as APNs</option>${[...new Set(data.rows.map(r=>r.apn||''))].filter(Boolean).map(a=>'<option>'+esc(a)+'</option>').join('')}</select><select id="live-generation" aria-label="Geração"><option value="">4G e 2G</option><option value="4G">4G • série 024</option><option value="2G">2G • demais séries</option></select></div><div class="modal-body-scroll table-wrap" id="live-vehicle-table"></div><div class="pager"><span id="live-count"></span><select id="live-size" aria-label="Itens por página"><option>8</option><option>16</option><option>25</option></select><button id="live-prev">Anterior</button><button id="live-next">Próxima</button></div>`,'','Consulte os veículos da base, organizados por APN.');
  const $=id=>document.getElementById(id);
  function detail(row){showModal('Detalhes do veículo','<div class="vehicle-details">'+[['Cliente',row.client],['Placa',row.plate],['Número de série',row.serial],['APN',row.apn],['Telefone do chip',row.phone],['Última comunicação',row.last||row.updated_at]].map(([label,value])=>'<div>'+label+'<b>'+esc(value||'Não informado')+'</b></div>').join('')+'</div><div class="form-actions"><button id="live-back">Voltar à lista</button></div>','medium',base.name);$('live-back').onclick=()=>list(base,data);}
  function draw(){
   const rows=filterVehicles(data.rows,{search:$('live-search').value,apn:$('live-apn').value,gen:$('live-generation').value});page=Math.min(page,Math.max(0,Math.ceil(rows.length/perPage)-1));const shown=rows.slice(page*perPage,page*perPage+perPage);
   $('live-vehicle-table').innerHTML='<table><thead><tr>'+['Cliente','Placa','Equipamento','APN','Telefone do chip','Última comunicação',''].map(t=>'<th>'+t+'</th>').join('')+'</tr></thead><tbody>'+([...new Set(shown.map(r=>r.apn||''))].map(a=>'<tr class="apn live-apn '+(collapsed.has(a)?'closed':'')+'"><td colspan="7"><button data-live-apn="'+esc(a)+'" aria-expanded="'+!collapsed.has(a)+'">'+arrow+'<b>APN: '+esc(a.toUpperCase()||'NÃO INFORMADA')+'</b><span class="pill">'+rows.filter(r=>(r.apn||'')===a).length+' veículos</span></button></td></tr>'+(collapsed.has(a)?'':shown.filter(r=>(r.apn||'')===a).map(r=>{const index=data.rows.indexOf(r);return '<tr class="vehicle" data-live-row="'+index+'"><td>'+esc(r.client||'Não informado')+'</td><td><b>'+esc(r.plate||'—')+'</b></td><td>'+esc(r.serial)+'</td><td><span class="pill green">'+esc(r.apn||'—')+'</span></td><td><span class="vehicle-phone">'+esc(r.phone||'—')+(/\d{6,}/.test(String(r.phone||'').replace(/\D/g,''))?'<button class="copy-phone" data-copy-phone="'+index+'" aria-label="Copiar telefone">⧉</button>':'')+'</span></td><td>'+esc(r.last||r.updated_at||'—')+'</td><td><button class="row-action" data-detail="'+index+'" aria-label="Detalhes do aparelho '+esc(r.serial)+'">›</button></td></tr>';}).join(''))).join('')||'<tr><td colspan="7" class="empty">Nenhum veículo para estes filtros.</td></tr>')+'</tbody></table>';
   $('live-count').textContent=`Exibindo ${rows.length?page*perPage+1:0}–${Math.min(rows.length,(page+1)*perPage)} de ${rows.length}`;$('live-prev').disabled=!page;$('live-next').disabled=(page+1)*perPage>=rows.length;
   $('live-vehicle-table').querySelectorAll('[data-live-apn]').forEach(b=>b.onclick=()=>{const a=b.dataset.liveApn;collapsed.has(a)?collapsed.delete(a):collapsed.add(a);draw();});
   $('live-vehicle-table').querySelectorAll('[data-live-row]').forEach(row=>row.onclick=e=>{if(e.target.closest('[data-copy-phone]'))return;detail(data.rows[+row.dataset.liveRow]);});
   $('live-vehicle-table').querySelectorAll('[data-copy-phone]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(data.rows[+b.dataset.copyPhone].phone);notify('Telefone copiado.');}catch{notify('Não foi possível copiar. Selecione o telefone na linha.');}});
  }
  for(const id of ['live-search','live-apn','live-generation'])$(id).oninput=()=>{page=0;draw();};$('live-size').onchange=e=>{perPage=+e.target.value;page=0;draw();};$('live-prev').onclick=()=>{page--;draw();};$('live-next').onclick=()=>{page++;draw();};draw();
 }
 function paint(){
  const rows=[...results.values()].map(r=>({...r,share:maintenanceShare(r.count,r.fleet_total)})).sort((a,b)=>(b.share??-1)-(a.share??-1));
  p.querySelector('#live-complete').textContent=results.size+' de '+repo.user.branches.length+' bases consultadas';
  p.querySelector('#base-progress').textContent=errors.size?'Consulta parcial • '+[...errors].map(([id,msg])=>repo.user.branches.find(b=>b.id===id).name+': '+msg).join(' • '):running?'Consultando as bases…':'Atualizado às '+new Date().toLocaleTimeString('pt-BR');
  const chart=p.querySelector('#base-chart');
  if(rows.length)chart.querySelector('.empty')?.remove();
  else if(!chart.children.length)chart.innerHTML='<p class="empty">Os totais aparecerão após a consulta.</p>';
  rows.forEach((r,i)=>{
   let button=chart.querySelector(`[data-base="${r.base.id}"]`);
   if(!button){button=document.createElement('button');button.className='chart-row';button.dataset.base=r.base.id;button.innerHTML='<span></span><span class="track"><i></i></span><b></b>';chart.append(button);}
   button.firstElementChild.textContent=r.base.name;
   button.querySelector('.track').style.setProperty('--color',colors[i%colors.length]);
   button.querySelector('.track').style.setProperty('--width',(r.share??0)+'%');
   button.querySelector('b').textContent=r.share===null?'Aguardando total':r.share.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'% da base';
   button.title=r.count.toLocaleString('pt-BR')+' veículos em manutenção'+(r.share===null?' • '+(r.fleet_warning||'Total ativo não confirmado'): ' de '+r.fleet_total.toLocaleString('pt-BR')+' veículos ativos');
   button.setAttribute('aria-label',r.base.name+': '+button.querySelector('b').textContent+'; '+button.title);
   if(chart.children[i]!==button)chart.insertBefore(button,chart.children[i]||null);
  });
  p.querySelector('#base-total').textContent=results.size?rows.reduce((n,r)=>n+r.count,0).toLocaleString('pt-BR'):'—';p.querySelector('#total-note').textContent=errors.size?'Consulta parcial • resultados anteriores preservados quando disponíveis.':results.size===repo.user.branches.length?'Total das '+results.size+' bases.':'Total parcial • bases pendentes não contam como zero.';
  p.querySelectorAll('[data-base]').forEach(b=>b.onclick=()=>{const r=results.get(b.dataset.base);if(r)list(r.base,r);});
 }
 async function refresh(force=false){if(running)return;running=true;p.querySelector('#live-refresh').disabled=true;errors.clear();paint();for(const base of repo.user.branches){if(!p.isConnected)break;try{let item=cache.get(base.id);if(force||!item||Date.now()-item.at>60000){item={data:await repo.request('integrations/maintenance?branch='+base.id),at:Date.now()};cache.set(base.id,item);}if(!p.isConnected)break;results.set(base.id,{base,...item.data});}catch(e){errors.set(base.id,e.message);}if(p.isConnected)paint();}running=false;if(p.isConnected){paint();p.querySelector('#live-refresh').disabled=false;}}
 p.querySelector('#live-refresh').onclick=()=>refresh(true);refresh();
}
