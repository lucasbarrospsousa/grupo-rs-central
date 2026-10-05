import {dischargeCache} from './discharge-cache.js';
import {pauseStockPolling} from './stock-pause.js';
import {analyzeBatches} from './discharge-batches.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selectable=r=>['eligible','stock','review'].includes(r.category);
const labels={pending:'Aguardando consulta',eligible:'Apto para baixa',stock:'Em estoque',review:'Conferir vínculo',error:'Falha na consulta',applied:'Baixa aplicada'};
export function openDischarge({repo,branch,showModal,notify,render}){
 const base=repo.user.branches.find(b=>b.id===branch)?.name||({imperatriz:'Imperatriz',araguaina:'Araguaína',acailandia:'Açailândia',maraba:'Marabá'}[branch]||branch),canWrite=repo.user.permissions?(repo.user.permissions.owner||repo.user.permissions.writes.includes('stock')):repo.user.branches.find(b=>b.id===branch)?.role!=='reader';
 const cache=dischargeCache(repo);let reused=0;
 let rows=[],selected=new Set(),page=1,search='',filter='',busy=false,review=false,controller,closed=false,changed=false,batch=0;
 showModal('Analisar baixa • '+esc(base.toUpperCase()),`<div class="discharge-counts" id="discharge-counts"></div><p id="discharge-progress" role="status"></p><form id="discharge-search" class="discharge-search"><input name="search" aria-label="Buscar série, placa ou cliente" placeholder="Buscar série, placa ou cliente"><select name="filter" aria-label="Filtrar resultados"><option value="">Todos os resultados</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><button class="primary">Buscar</button></form><div class="discharge-tools"><button id="discharge-select">Selecionar aptos</button><button id="discharge-clear">Limpar seleção</button><button id="discharge-retry">Analisar novamente</button></div><div class="discharge-table"><table><thead><tr><th>Selecionar / Série</th><th>Placa / identificação</th><th>Cliente</th><th>Resultado</th><th>Base</th></tr></thead><tbody id="discharge-rows"></tbody></table></div><div class="discharge-footer"><strong id="discharge-selected"></strong><div><button id="discharge-prev" aria-label="Página anterior">‹</button><span id="discharge-page"></span><button id="discharge-next" aria-label="Próxima página">›</button><button id="discharge-apply" class="primary">Aplicar baixa</button></div></div><p id="discharge-confirm" role="status"></p><small>Somente itens selecionados serão alterados. O vínculo será conferido novamente antes de aplicar.</small>`,'discharge-modal','Código do aparelho na API → placa atual → titular na web • baixa somente na Central');
 const modal=document.querySelector('#modal'),get=id=>modal.querySelector('#discharge-'+id),root=get('counts');
 const resumeStock=pauseStockPolling();
 const alive=()=>!closed&&modal.open&&root.isConnected;
 function cleanup(){if(closed)return;closed=true;controller?.abort();observer.disconnect();modal.removeEventListener('close',onClose);if(changed)render();resumeStock();}
 // A queued close from the previous modal must not cancel this new analysis.
 const onClose=()=>{if(!modal.open||!root.isConnected)cleanup();};
 const observer=new MutationObserver(()=>{if(!root.isConnected)cleanup();});observer.observe(modal,{childList:true});modal.addEventListener('close',onClose);
 function resetReview(){review=false;get('confirm').textContent='';}
 function draw(){
  if(!alive())return;
  const counts=category=>rows.filter(r=>r.category===category).length;
  get('counts').innerHTML=[['pending','NA ANÁLISE',rows.length],['eligible','APTOS PARA BAIXA',counts('eligible')],['stock','EM ESTOQUE',counts('stock')],['review','CONFERIR',counts('review')],['error','FALHAS',counts('error')]].map(([c,l,n])=>`<div class="${c}">${l} · ${n}</div>`).join('');
  get('progress').textContent=`Consultados ${rows.filter(r=>r.category!=='pending').length} de ${rows.length} aparelhos • ${base.toUpperCase()}${reused?' • '+reused+' resultados recentes (até 5 min)':''}${busy&&batch?' • Lote '+batch+' de '+Math.ceil(rows.length/50)+' (até 50 aparelhos)':''}`;
  const found=rows.filter(r=>(!filter||r.category===filter)&&(!search||[r.serial,r.plate,r.client].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(search))));
  const pages=Math.max(1,Math.ceil(found.length/5));page=Math.min(page,pages);
  get('rows').innerHTML=found.slice((page-1)*5,page*5).map(r=>`<tr><td><label><input type="checkbox" data-discharge-select="${esc(r.id)}" aria-label="Selecionar ${esc(r.serial)}" ${selected.has(r.id)?'checked':''} ${busy||!selectable(r)||!canWrite?'disabled':''}> ${esc(r.serial)}</label></td><td>${esc(r.plate||'—')}</td><td>${esc(r.client||(r.association_confirmed?'Titular não informado pelas fontes':'—'))}</td><td><span class="discharge-badge ${r.category}">${labels[r.category]}</span><small title="${esc(r.message)}">${esc(r.message||'')}</small></td><td>${esc(base.toUpperCase())}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum resultado neste filtro.</td></tr>';
  get('rows').querySelectorAll('input').forEach(el=>el.onchange=()=>{el.checked?selected.add(el.dataset.dischargeSelect):selected.delete(el.dataset.dischargeSelect);resetReview();draw();});
  get('selected').textContent=selected.size+' selecionado(s)';get('page').textContent=page+' / '+pages;get('prev').disabled=page===1;get('next').disabled=page===pages;
  get('select').disabled=busy||!canWrite||!rows.some(r=>r.ok&&r.category==='eligible');get('clear').disabled=busy||!selected.size;get('retry').disabled=busy;
  get('apply').disabled=busy||!canWrite||!selected.size;get('apply').textContent=review?'Confirmar e aplicar baixa':'Aplicar baixa';
 }
 async function analyze(force=false){
  if(busy)return;busy=true;resetReview();selected.clear();controller=new AbortController();
  reused=0;const originals=new Map();
  rows=repo.list(branch).filter(r=>r.status==='Estoque'||branch!=='imperatriz'&&r.status==='Reserva').map(r=>{originals.set(r.id,{...r});if(force)cache.clear(branch,r);const recent=force?null:cache.get(branch,r);if(recent)reused++;return{...r,plate:'',client:'',category:'pending',ok:false,message:'',...recent};});page=1;draw();
  await analyzeBatches(rows.filter(r=>r.category==='pending'),{signal:controller.signal,onWait:(row,seconds)=>{if(alive()){row.message=`Limite temporário de consultas. Nova tentativa em ${seconds}s…`;draw();}},onBatch:n=>{batch=n;draw();},query:row=>repo.request('integrations/binding?'+new URLSearchParams({branch,serial:row.serial}),{signal:controller.signal}),onResult:(row,result,error)=>{
   if(!alive())return;
   if(error)Object.assign(row,{category:'error',ok:false,message:error.message});
   else {cache.set(branch,originals.get(row.id),result);Object.assign(row,{plate:result.plate||'',client:result.client||'',association_confirmed:result.association_confirmed===true,ok:result.ok===true,category:result.ok?'eligible':['stock','error','review'].includes(result.category)?result.category:'review',message:result.message||''});}
   draw();
  }});
  busy=false;draw();
 }
 get('search').onsubmit=e=>{e.preventDefault();search=e.target.elements.search.value.trim().toLocaleLowerCase('pt-BR');filter=e.target.elements.filter.value;page=1;draw();};
 get('prev').onclick=()=>{page--;draw();};get('next').onclick=()=>{page++;draw();};
 get('select').onclick=()=>{rows.filter(r=>r.ok&&r.category==='eligible').forEach(r=>selected.add(r.id));resetReview();draw();};get('clear').onclick=()=>{selected.clear();resetReview();draw();};
 get('retry').onclick=()=>void analyze(true);
 get('apply').onclick=async()=>{
  if(busy||!canWrite||!selected.size)return;
  if(!review){review=true;get('confirm').textContent=`Confirmar baixa de ${selected.size} aparelho(s)? ${rows.filter(r=>selected.has(r.id)&&r.category!=='eligible').length} selecionado(s) exigem baixa manual, mesmo com resultado Em estoque ou Conferir vínculo. Serão marcados como Instalado somente na Central. O servidor consultará novamente cada vínculo.`;draw();return;}
  busy=true;draw();let done=0,failed=0;
  for(const row of rows.filter(r=>selected.has(r.id)&&selectable(r))){
   if(!alive())break;
   try{const original=repo.list(branch).find(r=>r.id===row.id);if(original)cache.clear(branch,original);await repo.request('integrations/discharge?branch='+branch,{method:'POST',key:row.key||(row.key=crypto.randomUUID()),body:{id:row.id,version:row.version,plate:row.plate,client:row.client,...(row.category!=='eligible'?{manual:true,confirmedCategory:row.category}:{})}});done++;changed=true;Object.assign(row,{ok:false,category:'applied',message:'Instalado • salvo na Central'});}
   catch(error){failed++;Object.assign(row,{ok:false,category:'error',message:error.message});}
   selected.delete(row.id);draw();
  }
  // Closing stops the remaining batch; an already submitted write may finish.
  if(changed)try{await repo.load(branch);}catch(error){notify('Baixas confirmadas; não foi possível atualizar a lista: '+error.message);}
  busy=false;review=false;if(alive()){get('confirm').textContent=`${done} baixa(s) aplicada(s) • ${failed} pendência(s).`;draw();}else if(changed)render();
 };
 void analyze();
}
