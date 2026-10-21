import {retainChipSelection} from './warehouse-chip-selection.js';
import {copyCandidate,copySelectedIccids} from './warehouse-chip-copy.js';
import {savedView} from './saved-view.js';
import {activationCandidate,activationLabels} from './warehouse-activation-model.js';
import {mountWarehouseActivation} from './warehouse-activation.js';
import {cachedWarehouseCosts,loadWarehouseCosts} from './warehouse-cost-cache.js';
import {mountChipBilling} from './warehouse-chip-billing.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const chipIcon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${{alert:'M12 3L2 21h20z M12 9v5 M12 17v.1',check:'M4 12l5 5L20 6',bolt:'M13 2L4 14h7l-1 8 10-13h-8z',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'}[name]}"/></svg>`;
export const chipProvider=r=>r.chip_provider==='arya'?'Árya':r.chip_provider==='link'?'Link Solutions':'Não informado';
export function chipSituation(r){
 if(r.status!=='Disponível')return [r.status||'Não informado','blue'];
 if(activationLabels[r.activation_state])return [activationLabels[r.activation_state],r.activation_state==='active'?'teal':'amber'];
 if(activationCandidate(r))return ['Aguardando ativação manual','violet'];
 return [r.chip_phone?'Disponível para uso':'A conferir',r.chip_phone?'teal':'amber'];
}
export function filterChips(rows,{query='',category='',provider='',status='Disponível'}={}){
 const text=query.trim().toLocaleLowerCase('pt-BR');
 return rows.filter(r=>r.kind==='chip'&&(!status||r.status===status)&&(!category||(r.classification||'Estoque')===category)&&(!provider||r.chip_provider===provider)&&[r.serial,r.chip_phone,r.chip_operator,chipProvider(r)].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(text)));
}
export function mountWarehouseChips(root,{repo,icon,onUpdate=()=>{},onDetail,onClassify,onRemove}){
 let section='inventory',activation=null,loadingCosts=false;
 const selectionRows=new Map();
 let copyRows=[],rows=[],selected=new Set(),page=0,busy=false,message='',filters={query:'',category:'',provider:'',status:'Disponível'};
 const remote=repo.real?savedView(repo,repo.currentBranch,'warehouse',root,draw):null;
 const prices=repo.real&&repo.user?.permissions?.owner?savedView(repo,repo.currentBranch,'warehouse-costs',root,draw,{revision:()=>repo.costRevision||0}):null;
 const canWrite=()=>repo.real&&repo.user?.branches?.some(b=>b.id==='imperatriz'&&b.role==='admin')&&(repo.user?.permissions?.owner||repo.user?.permissions?.writes?.includes('warehouse'));
 const tone=c=>c==='Reserva'?'violet':c==='Emergência'?'amber':'teal';
 const option=(value,text,current)=>`<option value="${value}" ${value===current?'selected':''}>${text}</option>`;
 async function copy(){
  if(busy||!selected.size)return;
  const ids=[...selected];busy=true;
  try{const count=await copySelectedIccids(copyRows,ids);message=count+' ICCIDs copiados, separados por ponto e vírgula.';selected.clear();}
  catch(e){message=e.message;}
  finally{busy=false;if(root.isConnected)draw();}
 }
 function draw(){
  if(!root.isConnected||root.hidden||activation?.busy)return;
  const result=remote?.get({view:'chips',...filters,page});if(remote&&!result)return;const inventory=result?.rows||rows;
  const available=rows.filter(r=>r.kind==='chip'&&r.status==='Disponível'),list=result?.rows||filterChips(rows,filters),costs=prices?.get({view:'prices',iccids:(result?.rows||[]).slice(0,7).map(r=>r.serial).join(',')})||cachedWarehouseCosts(repo);

  page=Math.min(page,Math.max(0,Math.ceil((result?.total??list.length)/7)-1));const visible=remote?list:list.slice(page*7,page*7+7);copyRows=retainChipSelection(selectionRows,selected,visible,canWrite());
  root.innerHTML=`<nav class="wc-sections" aria-label="Gestão de chips"><button data-ci-section="inventory" aria-pressed="${section==='inventory'}">${icon('chip')} Estoque de chips</button>${repo.user?.permissions?.owner?`<button data-ci-section="billing" aria-pressed="${section==='billing'}">${icon('list')} Mensalidades e vínculos</button>`:''}<button data-ci-section="activation" aria-pressed="${section==='activation'}">${chipIcon('bolt')} Acompanhar ativações</button></nav><div class="wc-metrics">${[['Estoque','box','Chips disponíveis para uso'],['Reserva','chip','Chips aguardando ativação'],['Emergência','alert','Separados para emergência']].map(([c,g,sub])=>`<button class="wc-metric ${tone(c)}" data-ci-category="${c}" aria-pressed="${filters.category===c}"><span class="wc-icon-tile">${g==='alert'?chipIcon('alert'):icon(g)}</span><span><small>${c}</small><strong>${result?.counts?.chip?.[c]??available.filter(r=>(r.classification||'Estoque')===c).length}</strong><em>${sub}</em></span></button>`).join('')}<button class="wc-metric blue" data-ci-category="" aria-pressed="${!filters.category}"><span class="wc-icon-tile">${icon('chip')}</span><span><small>Total de chips</small><strong>${result?.counts?.chip?.total??available.length}</strong><em>No armazém</em></span></button></div>
  <section class="wc-panel wc-inventory-panel" ${section!=='inventory'?'hidden':''}><div class="wc-toolbar"><label class="wc-search">${icon('search')}<input id="ci-search" aria-label="Buscar chips no inventário" placeholder="Buscar ICCID, telefone ou operadora…" value="${esc(filters.query)}"></label><select id="ci-category" aria-label="Categoria dos chips">${[['','Todas as categorias'],['Estoque','Estoque'],['Reserva','Reserva'],['Emergência','Emergência']].map(([v,t])=>option(v,t,filters.category)).join('')}</select><select id="ci-provider" aria-label="Provedor dos chips">${[['','Todos os provedores'],['arya','Árya'],['link','Link Solutions']].map(([v,t])=>option(v,t,filters.provider)).join('')}</select><select id="ci-status" aria-label="Situação no armazém">${[['Disponível','No armazém'],['','Todas as situações'],['Enviado','Enviados'],['Utilizado','Utilizados']].map(([v,t])=>option(v,t,filters.status)).join('')}</select></div>
  <div class="wc-table-wrap"><table><thead><tr><th><input id="ci-select-page" type="checkbox" aria-label="Selecionar elegíveis desta página" ${!canWrite()||busy||!visible.some(copyCandidate)?'disabled':''} ${visible.some(copyCandidate)&&visible.filter(copyCandidate).every(r=>selected.has(r.id))?'checked':''}></th><th>ICCID / operadora</th><th>Telefone / aparelho</th><th>Categoria</th><th>Situação</th><th>Mensalidade</th><th>Ações</th></tr></thead><tbody>${visible.map(r=>{
   const [status,color]=chipSituation(r),price=[...(costs?.items||[]),...(costs?.inventory_items||[])].find(c=>c.iccid===r.serial),category=r.classification||'Estoque';
   return `<tr class="${selected.has(r.id)?'is-selected':''}"><td><input type="checkbox" data-ci-id="${esc(r.id)}" aria-label="Selecionar chip ${esc(r.serial)}" ${selected.has(r.id)?'checked':''} ${busy||!canWrite()||!copyCandidate(r)?'disabled':''}></td><td><button class="wc-serial" data-ci-detail="${esc(r.id)}">${esc(r.serial)}</button><small>${esc(r.chip_operator||'Operadora não informada')} · ${chipProvider(r)}</small></td><td>${esc(r.chip_phone||'Não disponível')}<small>${esc(price?.devices?.filter(Boolean).join(', ')||r.usage_device_serial||'Sem aparelho associado')}</small></td><td><span class="wc-tag ${tone(category)}">${category==='Emergência'?chipIcon('alert'):icon(category==='Estoque'?'box':'chip')}${esc(category)}</span></td><td><span class="wc-status ${color}"><i></i>${esc(status)}</span></td><td class="wc-price">${price&&Number.isInteger(price.cents)?money(price.cents):'<span class="wc-muted">Sem valor salvo</span>'}</td><td><div class="wc-row-actions"><button data-ci-detail="${esc(r.id)}" aria-label="Detalhes do chip ${esc(r.serial)}" title="Ver detalhes">${chipIcon('eye')}</button><details><summary aria-label="Mais ações do chip ${esc(r.serial)}" title="Mais ações">•••</summary><div class="wc-menu" popover="auto"><label>Classificação<select data-ci-classify="${esc(r.id)}" aria-label="Classificação de ${esc(r.serial)}" ${busy||!canWrite()?'disabled':''}>${['Estoque','Reserva','Emergência'].map(c=>option(c,c,category)).join('')}</select></label><button data-ci-remove="${esc(r.id)}" ${busy||!canWrite()||r.status!=='Disponível'||(r.activation_state&&r.activation_state!=='active')?'disabled':''}>${icon('close')} Remover do armazém</button></div></details></div></td></tr>`;
  }).join('')||'<tr><td colspan="7" class="empty">Nenhum chip encontrado para estes filtros.</td></tr>'}</tbody></table></div>
  <div class="wc-selection"><div><strong>${chipIcon('check')} ${selected.size} chips selecionados</strong><button id="ci-copy" class="primary" ${!canWrite()||busy||!selected.size?'disabled':''}>${chipIcon('bolt')} ${busy?'Processando…':'Copiar ICCIDs'}</button><button class="wc-link" id="ci-clear" ${busy||!selected.size?'disabled':''}>Limpar seleção</button></div><div class="wc-bottom"><small>Ative manualmente na operadora. A Central apenas consulta a situação.</small><button class="wc-link" id="ci-history">Acompanhar ativações →</button><span class="wc-pager"><small>Mostrando ${(result?.total??list.length)?page*7+1:0}–${Math.min((page+1)*7,result?.total??list.length)} de ${result?.total??list.length} chips</small><button id="ci-prev" aria-label="Página anterior" ${page===0?'disabled':''}>‹</button><b>${page+1}</b><button id="ci-next" aria-label="Próxima página" ${(page+1)*7>=(result?.total??list.length)?'disabled':''}>›</button></span></div></div>
  <p class="wc-message" role="status">${esc(message||(!repo.real?'Demonstração: solicitações de ativação desabilitadas.':''))}</p></section><section class="wc-panel wc-billing" ${section!=='billing'?'hidden':''}></section><section class="wc-panel wc-activation" ${section!=='activation'?'hidden':''}></section>`;
  root.querySelectorAll('[data-ci-section]').forEach(b=>b.onclick=()=>{if(busy||activation?.busy)return;selected.clear();activation?.clearSelection();section=b.dataset.ciSection;draw();});
  if(section==='billing')mountChipBilling(root.querySelector('.wc-billing'),{repo,icon});
  if(section==='activation'){activation=mountWarehouseActivation(root.querySelector('.wc-activation'),{repo,icon,onUpdate,idPrefix:'chips-'});activation.update(inventory);}

  root.querySelectorAll('[data-ci-category]').forEach(b=>b.onclick=()=>{selected.clear();activation?.clearSelection();section='inventory';filters.category=b.dataset.ciCategory;page=0;draw();});
  for(const [id,key] of [['ci-category','category'],['ci-provider','provider'],['ci-status','status']])root.querySelector('#'+id).onchange=e=>{selected.clear();filters[key]=e.target.value;page=0;draw();};
  root.querySelector('#ci-search').oninput=e=>{filters.query=e.target.value;page=0;const position=e.target.selectionStart;draw();const input=root.querySelector('#ci-search');input.focus();input.setSelectionRange(position,position);};
  root.querySelectorAll('[data-ci-id]').forEach(c=>c.onchange=()=>{if(!busy&&canWrite()){if(c.checked)selected.add(c.dataset.ciId);else selected.delete(c.dataset.ciId);}draw();});
  root.querySelector('#ci-select-page').onchange=e=>{if(busy||!canWrite())return;for(const r of visible.filter(copyCandidate)){if(!e.target.checked)selected.delete(r.id);else selected.add(r.id);}draw();};
  const eligiblePage=visible.filter(copyCandidate),selectedPage=eligiblePage.filter(r=>selected.has(r.id)).length;
  root.querySelector('#ci-select-page').indeterminate=selectedPage>0&&selectedPage<eligiblePage.length;
  root.querySelector('#ci-clear').onclick=()=>{selected.clear();draw();};root.querySelector('#ci-copy').onclick=copy;
  root.querySelector('#ci-prev').onclick=()=>{page--;draw();};root.querySelector('#ci-next').onclick=()=>{page++;draw();};root.querySelector('#ci-history').onclick=()=>{selected.clear();section='activation';draw();};
  root.querySelectorAll('.wc-row-actions details').forEach(details=>{
   const menu=details.querySelector('.wc-menu'),trigger=details.querySelector('summary');
   trigger.onclick=e=>{e.preventDefault();if(menu.matches(':popover-open')){menu.hidePopover();return;}details.open=true;menu.showPopover();const anchor=trigger.getBoundingClientRect(),box=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(anchor.right-box.width,innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,anchor.bottom+box.height+8>innerHeight?anchor.top-box.height-6:anchor.bottom+6)+'px';};
   menu.addEventListener('toggle',e=>{if(e.newState==='closed')details.open=false;});
  });
  root.querySelectorAll('[data-ci-detail]').forEach(b=>b.onclick=()=>onDetail(b.dataset.ciDetail));
  root.querySelectorAll('[data-ci-classify]').forEach(s=>s.onchange=()=>{s.disabled=true;onClassify(s.dataset.ciClassify,s.value);});
  root.querySelectorAll('[data-ci-remove]').forEach(b=>b.onclick=()=>onRemove(b.dataset.ciRemove));
 }
 return {clearSelection(){selected.clear();activation?.clearSelection();},update(next){rows=next;if(root.hidden)return;if(!busy){if(section==='activation'&&activation)activation.update(rows);else if(section!=='billing'||!root.querySelector('#cb-search'))draw();}if(!loadingCosts&&!cachedWarehouseCosts(repo)&&repo.real&&repo.user?.permissions?.owner){loadingCosts=true;loadWarehouseCosts(repo).then(()=>{if(section==='inventory'&&!busy)draw();}).catch(()=>{});}},filter(category){selected.clear();activation?.clearSelection();section='inventory';filters.category=category;page=0;draw();}};
}
