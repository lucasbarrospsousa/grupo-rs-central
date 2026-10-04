import {visibleStatus} from './stock-model.js';
import {basePlatforms,monitorLabels,monitorState,monitorCounts,monitorDate} from './stock-monitor.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#e8af08','#ff880a','#ee3452','#12ae68'];
const date=v=>monitorDate(v,'Não consultado');
export function mountStockOverview({repo,host,showModal}){
 const bases=repo.user.branches,results=new Map(),errors=new Map(),pending=new Set();let running=false;
 host.dataset.independent='true';
 host.innerHTML='<div class="live-heading"><div><h2>Estoque por base <span class="pill" id="stock-bases-complete"></span></h2><p class="muted">Comunicação e status do chip • somente aparelhos em estoque.</p></div><button id="stock-bases-refresh">Atualizar estoques</button></div><div class="grid four live-grid" id="stock-bases"></div><div class="live-progress" id="stock-bases-progress" role="status"></div>';
 function list(base,selected){
  let page=0;
  showModal('Estoque · '+base.name,'<div class="monitor-tabs" id="monitor-tabs"></div><p class="muted">Classificação conforme a regra da aba Estoque. Falha de consulta não significa aparelho desligado.</p><input id="base-stock-search" type="search" placeholder="Buscar série ou identificação" aria-label="Buscar aparelhos"><div class="table-wrap modal-body-scroll" id="base-stock-table"></div><div class="pager"><span id="base-stock-count"></span><button id="base-stock-prev">Anterior</button><button id="base-stock-next">Próxima</button></div>');
  const $=id=>document.getElementById(id),rows=results.get(base.id)||[],now=Date.now(),counts=monitorCounts(rows,now);
  function draw(){
   $('monitor-tabs').innerHTML=Object.entries(counts).filter(([key,n])=>['on','off','stale'].includes(key)||n).map(([key,n])=>'<button data-monitor-tab="'+key+'" class="monitor-status '+key+'" aria-pressed="'+(selected===key)+'">'+monitorLabels[key]+' <strong>'+n+'</strong></button>').join('');
   $('monitor-tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.monitorTab;page=0;draw();});
   const q=$('base-stock-search').value.trim().toLocaleLowerCase('pt-BR'),found=rows.filter(r=>monitorState(r,now)===selected&&[r.serial,r.identification].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));page=Math.min(page,Math.max(0,Math.ceil(found.length/10)-1));
   $('base-stock-table').innerHTML='<table><thead><tr><th>Aparelho</th><th>Identificação</th><th>Comunicação</th><th>Chip</th><th>Última comunicação</th></tr></thead><tbody>'+ (found.slice(page*10,page*10+10).map(r=>{const chip=r.observation?.chip,valid=chip?.ok&&chip.iccid===r.iccid;return '<tr><td>'+esc(r.serial)+'</td><td>'+esc(r.identification||'—')+'</td><td><span class="monitor-status '+selected+'">'+esc(({on:'Ligado',off:'Desligado',stale:'Desatualizado',unknown:'Não verificado',gps:'Possível GPS'})[selected])+'</span></td><td title="'+esc('Consulta do chip: '+date(r.observation?.chip_checked_at))+'">'+esc(valid?(chip.connectivity||chip.status||'Não informado'):'Não verificado')+'</td><td><div>'+esc(monitorDate(r.observation?.location?.updated_at))+'</div><small class="muted">Consultado pela Central em '+esc(date(r.checked_at))+'</small></td></tr>';}).join('')||'<tr><td colspan="5" class="empty">Nenhum aparelho neste status.</td></tr>')+'</tbody></table>';
   $('base-stock-count').textContent=`${found.length?page*10+1:0}–${Math.min(found.length,page*10+10)} de ${found.length} aparelhos`;$('base-stock-prev').disabled=!page;$('base-stock-next').disabled=(page+1)*10>=found.length;
  }
  $('base-stock-search').oninput=()=>{page=0;draw();};$('base-stock-prev').onclick=()=>{page--;draw();};$('base-stock-next').onclick=()=>{page++;draw();};draw();
 }
 function paint(){
  const container=host.querySelector('#stock-bases');
  for(const [i,base] of bases.entries()){
   let card=container.querySelector(`[data-stock-base="${base.id}"]`);
   if(!card){card=document.createElement('article');card.className='branch-card monitor-card';card.dataset.stockBase=base.id;card.style.setProperty('--color',colors[i%colors.length]);const link=basePlatforms[base.id];card.innerHTML='<strong>'+(link?'<a href="'+link+'" target="_blank" rel="noopener noreferrer">'+esc(base.name)+' ↗</a>':esc(base.name))+'</strong><b class="value"></b><small></small><div class="monitor-statuses"></div><div class="foot">'+(link?'<a href="'+link+'" target="_blank" rel="noopener noreferrer">Abrir plataforma ↗</a>':'Plataforma não configurada')+'</div>';container.append(card);}
   const rows=results.get(base.id),error=errors.get(base.id);card.setAttribute('aria-busy',String(!rows&&!error));
   card.querySelector('.value').textContent=rows?rows.length.toLocaleString('pt-BR'):error?'Pendente':'—';card.querySelector('small').textContent=error?(rows?'Último resultado • falha ao atualizar':'Não foi possível consultar'):rows?(pending.has(base.id)?'aparelhos • atualizando…':'aparelhos em estoque'):'Consultando estoque…';
   card.querySelector('.monitor-statuses').innerHTML=rows?Object.entries(monitorCounts(rows)).filter(([key,n])=>['on','off','stale'].includes(key)||n).map(([key,n])=>'<button class="monitor-status '+key+'" data-monitor="'+key+'" aria-label="'+esc(base.name+' · '+monitorLabels[key]+': '+n)+'"><span>'+monitorLabels[key]+'</span><strong>'+n+' ›</strong></button>').join(''):'';
   card.querySelectorAll('[data-monitor]').forEach(b=>b.onclick=()=>list(base,b.dataset.monitor));
  }
  host.querySelector('#stock-bases-complete').textContent=results.size+' de '+bases.length+' bases consultadas';
  host.querySelector('#stock-bases-progress').textContent=errors.size?'Consulta parcial • '+[...errors].map(([id,msg])=>bases.find(b=>b.id===id).name+': '+msg).join(' • '):running?'Consultando estoques • bases prontas já disponíveis':'Resultados salvos no servidor • tela atualizada às '+new Date().toLocaleTimeString('pt-BR');
 }
 async function refresh(){if(running||!host.isConnected)return;running=true;errors.clear();bases.forEach(b=>pending.add(b.id));host.querySelector('#stock-bases-refresh').disabled=true;paint();
  await Promise.all(bases.map(async base=>{try{const data=await repo.request('devices?branch='+encodeURIComponent(base.id)+'&scope=stock');if(!Array.isArray(data.rows))throw Error('Resposta de estoque incompleta.');if(host.isConnected)results.set(base.id,data.rows.filter(r=>!r.deleted_at&&visibleStatus(r,base.id)==='Estoque'));}catch(e){if(host.isConnected)errors.set(base.id,e.message);}finally{pending.delete(base.id);}if(host.isConnected)paint();}));
  running=false;if(host.isConnected){paint();host.querySelector('#stock-bases-refresh').disabled=false;}
 }
 host.querySelector('#stock-bases-refresh').onclick=refresh;void refresh();
 // Only read saved summaries while visible; never trigger remote polling from the page.
 const timer=setInterval(()=>{if(!host.isConnected){clearInterval(timer);return;}if(document.visibilityState!=='hidden')void refresh();},120000);
}
