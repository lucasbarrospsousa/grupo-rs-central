import {openDischarge} from './discharge-panel.js';
import {isReader} from './access-control.js';
import {visibleStatus} from './stock-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#e8af08','#ff880a','#ee3452','#12ae68'];
export function mountStockOverview({repo,host,showModal,notify,render}){
 const bases=repo.user.branches,results=new Map(),errors=new Map();let running=false;
 host.innerHTML='<div class="live-heading"><div><h2>Estoque por base <span class="pill" id="stock-bases-complete"></span></h2><p class="muted">Aparelhos em estoque cadastrados na Central.</p></div><button id="stock-bases-refresh">Atualizar estoques</button></div><div class="grid four live-grid" id="stock-bases"></div><div class="live-progress" id="stock-bases-progress" role="status"></div>';
 function list(base,rows){
  const canDischarge=!isReader(repo.user,base.id,'stock');
  let page=0;showModal('Estoque · '+base.name,'<div class="live-heading"><p class="muted">Aparelhos disponíveis no estoque da Central.</p>'+ (canDischarge?'<button id="base-stock-analyze" data-discharge class="primary">Analisar baixa</button>':'')+'</div><input id="base-stock-search" type="search" placeholder="Buscar série, identificação ou placa" aria-label="Buscar aparelhos"><div class="table-wrap modal-body-scroll" id="base-stock-table"></div><div class="pager"><span id="base-stock-count"></span><button id="base-stock-prev">Anterior</button><button id="base-stock-next">Próxima</button></div>');
  const $=id=>document.getElementById(id);
  if(canDischarge)$('base-stock-analyze').onclick=async e=>{
   const button=e.currentTarget;button.disabled=true;button.textContent='Carregando estoque…';
   try{
    await repo.load(base.id,{route:'stock'});
    if(!button.isConnected||!document.querySelector('#modal').open)return;
    openDischarge({repo,branch:base.id,showModal,notify,render});
   }catch(error){notify(error.message);}finally{if(button.isConnected){button.disabled=false;button.textContent='Analisar baixa';}}
  };
  function draw(){const q=$('base-stock-search').value.trim().toLocaleLowerCase('pt-BR'),found=rows.filter(r=>[r.serial,r.identification,r.plate,r.model,r.carrier].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));page=Math.min(page,Math.max(0,Math.ceil(found.length/10)-1));
   $('base-stock-table').innerHTML='<table><thead><tr><th>Série</th><th>Identificação</th><th>Veículo / placa</th><th>Modelo</th><th>Operadora</th></tr></thead><tbody>'+ (found.slice(page*10,page*10+10).map(r=>'<tr>'+[r.serial,r.identification,r.plate,r.model,r.carrier].map(v=>'<td>'+esc(v||'—')+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="5" class="empty">Nenhum aparelho em estoque para esta consulta.</td></tr>')+'</tbody></table>';
   $('base-stock-count').textContent=`${found.length?page*10+1:0}–${Math.min(found.length,page*10+10)} de ${found.length} aparelhos`;$('base-stock-prev').disabled=!page;$('base-stock-next').disabled=(page+1)*10>=found.length;
  }
  $('base-stock-search').oninput=()=>{page=0;draw();};$('base-stock-prev').onclick=()=>{page--;draw();};$('base-stock-next').onclick=()=>{page++;draw();};draw();
 }
 function paint(){
  host.querySelector('#stock-bases').innerHTML=bases.map((base,i)=>{const rows=results.get(base.id),error=errors.get(base.id);return '<button class="branch-card" data-stock-base="'+esc(base.id)+'" style="--color:'+colors[i%colors.length]+'" '+(!rows?'disabled':'')+' aria-busy="'+(!rows&&!error)+'"><strong>'+esc(base.name)+'</strong><b class="value">'+(rows?rows.length.toLocaleString('pt-BR'):error?'Pendente':'—')+'</b><small>'+(rows?'aparelhos em estoque':error?'Não foi possível consultar':'Consultando estoque…')+'</small><div class="foot">'+(rows?'Ver estoque ›':error?'Use Atualizar estoques para tentar novamente':'Aguarde')+'</div></button>';}).join('');
  host.querySelector('#stock-bases-complete').textContent=results.size+' de '+bases.length+' bases consultadas';
  host.querySelector('#stock-bases-progress').textContent=errors.size?'Consulta parcial • '+[...errors].map(([id,msg])=>bases.find(b=>b.id===id).name+': '+msg).join(' • '):running?'Consultando estoques…':'Estoque da Central consultado às '+new Date().toLocaleTimeString('pt-BR');
  host.querySelectorAll('[data-stock-base]').forEach(b=>b.onclick=()=>list(bases.find(base=>base.id===b.dataset.stockBase),results.get(b.dataset.stockBase)));
 }
 async function refresh(){if(running)return;running=true;results.clear();errors.clear();host.querySelector('#stock-bases-refresh').disabled=true;paint();
  await Promise.all(bases.map(async base=>{try{const data=await repo.request('devices?branch='+encodeURIComponent(base.id));if(!Array.isArray(data.rows))throw Error('Resposta de estoque incompleta.');if(host.isConnected)results.set(base.id,data.rows.filter(r=>!r.deleted_at&&visibleStatus(r,base.id)==='Estoque'));}catch(e){if(host.isConnected)errors.set(base.id,e.message);}if(host.isConnected)paint();}));
  running=false;if(host.isConnected){paint();host.querySelector('#stock-bases-refresh').disabled=false;}
 }
 host.querySelector('#stock-bases-refresh').onclick=refresh;void refresh();
}
