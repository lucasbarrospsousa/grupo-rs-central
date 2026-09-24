const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'Aguardando consulta',eligible:'Apto para baixa',stock:'Em estoque',review:'Conferir vínculo',error:'Falha na consulta',applied:'Baixa aplicada'};
export function openDischarge({repo,branch,showModal,notify,render}){
 const base=repo.user.branches.find(b=>b.id===branch)?.name||({imperatriz:'Imperatriz',araguaina:'Araguaína',acailandia:'Açailândia',maraba:'Marabá'}[branch]||branch),canWrite=repo.user.branches.find(b=>b.id===branch)?.role!=='reader';
 let rows=[],selected=new Set(),page=1,search='',filter='',busy=false,review=false,controller,closed=false,changed=false;
 showModal('Analisar baixa • '+esc(base.toUpperCase()),`<div class="discharge-counts" id="discharge-counts"></div><p id="discharge-progress" role="status"></p><form id="discharge-search" class="discharge-search"><input name="search" aria-label="Buscar série, placa ou cliente" placeholder="Buscar série, placa ou cliente"><select name="filter" aria-label="Filtrar resultados"><option value="">Todos os resultados</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select><button class="primary">Buscar</button></form><div class="discharge-tools"><button id="discharge-select">Selecionar aptos</button><button id="discharge-clear">Limpar seleção</button><button id="discharge-retry">Analisar novamente</button></div><div class="discharge-table"><table><thead><tr><th>Selecionar / Série</th><th>Placa / identificação</th><th>Cliente</th><th>Resultado</th><th>Base</th></tr></thead><tbody id="discharge-rows"></tbody></table></div><div class="discharge-footer"><strong id="discharge-selected"></strong><div><button id="discharge-prev" aria-label="Página anterior">‹</button><span id="discharge-page"></span><button id="discharge-next" aria-label="Próxima página">›</button><button id="discharge-apply" class="primary">Aplicar baixa</button></div></div><p id="discharge-confirm" role="status"></p><small>Somente itens selecionados serão alterados. O vínculo será conferido novamente antes de aplicar.</small>`,'discharge-modal','Conferência da API • atualização somente do estoque da Central');
 const modal=document.querySelector('#modal'),get=id=>modal.querySelector('#discharge-'+id),root=get('counts');
 const alive=()=>!closed&&modal.open&&root.isConnected;
 function cleanup(){closed=true;controller?.abort();observer.disconnect();modal.removeEventListener('close',cleanup);if(changed)render();}
 const observer=new MutationObserver(()=>{if(!root.isConnected)cleanup();});observer.observe(modal,{childList:true});modal.addEventListener('close',cleanup);
 function resetReview(){review=false;get('confirm').textContent='';}
 function draw(){
  if(!alive())return;
  const counts=category=>rows.filter(r=>r.category===category).length;
  get('counts').innerHTML=[['pending','NA ANÁLISE',rows.length],['eligible','APTOS PARA BAIXA',counts('eligible')],['stock','EM ESTOQUE',counts('stock')],['review','CONFERIR',counts('review')],['error','FALHAS',counts('error')]].map(([c,l,n])=>`<div class="${c}">${l} · ${n}</div>`).join('');
  get('progress').textContent=`Consultados ${rows.filter(r=>r.category!=='pending').length} de ${rows.length} aparelhos • ${base.toUpperCase()}`;
  const found=rows.filter(r=>(!filter||r.category===filter)&&(!search||[r.serial,r.plate,r.client].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(search))));
  const pages=Math.max(1,Math.ceil(found.length/5));page=Math.min(page,pages);
  get('rows').innerHTML=found.slice((page-1)*5,page*5).map(r=>`<tr><td><label><input type="checkbox" data-discharge-select="${esc(r.id)}" aria-label="Selecionar ${esc(r.serial)}" ${selected.has(r.id)?'checked':''} ${busy||!r.ok||r.category!=='eligible'||!canWrite?'disabled':''}> ${esc(r.serial)}</label></td><td>${esc(r.plate||'—')}</td><td>${esc(r.client||'—')}</td><td><span class="discharge-badge ${r.category}">${labels[r.category]}</span><small title="${esc(r.message)}">${esc(r.message||'')}</small></td><td>${esc(base.toUpperCase())}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum resultado neste filtro.</td></tr>';
  get('rows').querySelectorAll('input').forEach(el=>el.onchange=()=>{el.checked?selected.add(el.dataset.dischargeSelect):selected.delete(el.dataset.dischargeSelect);resetReview();draw();});
  get('selected').textContent=selected.size+' selecionado(s)';get('page').textContent=page+' / '+pages;get('prev').disabled=page===1;get('next').disabled=page===pages;
  get('select').disabled=busy||!canWrite||!rows.some(r=>r.ok&&r.category==='eligible');get('clear').disabled=busy||!selected.size;get('retry').disabled=busy;
  get('apply').disabled=busy||!canWrite||!selected.size;get('apply').textContent=review?'Confirmar e aplicar baixa':'Aplicar baixa';
 }
 async function analyze(){
  if(busy)return;busy=true;resetReview();selected.clear();controller=new AbortController();
  rows=repo.list(branch).filter(r=>r.status==='Estoque'||branch!=='imperatriz'&&r.status==='Reserva').map(r=>({...r,plate:'',client:'',category:'pending',ok:false,message:''}));page=1;draw();
  for(const row of rows){if(!alive())return;try{
   const result=await repo.request('integrations/binding?'+new URLSearchParams({branch,serial:row.serial}),{signal:controller.signal});
   if(!alive())return;Object.assign(row,{plate:result.plate||'',client:result.client||'',ok:result.ok===true,category:result.ok?'eligible':['stock','error','review'].includes(result.category)?result.category:'review',message:result.message||''});
  }catch(error){if(!alive())return;Object.assign(row,{category:'error',ok:false,message:error.message});}draw();}
  busy=false;draw();
 }
 get('search').onsubmit=e=>{e.preventDefault();search=e.target.elements.search.value.trim().toLocaleLowerCase('pt-BR');filter=e.target.elements.filter.value;page=1;draw();};
 get('prev').onclick=()=>{page--;draw();};get('next').onclick=()=>{page++;draw();};
 get('select').onclick=()=>{rows.filter(r=>r.ok&&r.category==='eligible').forEach(r=>selected.add(r.id));resetReview();draw();};get('clear').onclick=()=>{selected.clear();resetReview();draw();};
 get('retry').onclick=()=>void analyze();
 get('apply').onclick=async()=>{
  if(busy||!canWrite||!selected.size)return;
  if(!review){review=true;get('confirm').textContent=`Confirmar baixa de ${selected.size} aparelho(s)? O servidor consultará novamente cada vínculo.`;draw();return;}
  busy=true;draw();let done=0,failed=0;
  for(const row of rows.filter(r=>selected.has(r.id)&&r.ok&&r.category==='eligible')){
   if(!alive())break;
   try{await repo.request('integrations/discharge?branch='+branch,{method:'POST',key:row.key||(row.key=crypto.randomUUID()),body:{id:row.id,version:row.version,plate:row.plate,client:row.client}});done++;changed=true;Object.assign(row,{ok:false,category:'applied',message:'Instalado • salvo na Central'});}
   catch(error){failed++;Object.assign(row,{ok:false,category:'error',message:error.message});}
   selected.delete(row.id);draw();
  }
  // Closing stops the remaining batch; an already submitted write may finish.
  if(changed)try{await repo.load(branch);}catch(error){notify('Baixas confirmadas; não foi possível atualizar a lista: '+error.message);}
  busy=false;review=false;if(alive()){get('confirm').textContent=`${done} baixa(s) aplicada(s) • ${failed} pendência(s).`;draw();}else if(changed)render();
 };
 void analyze();
}
