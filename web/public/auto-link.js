const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupAutoLink({repo,branch,showModal,notify,refresh}){
 const allowed=repo.real&&(repo.user?.permissions?.owner||repo.user?.permissions?.writes?.includes('stock'));
 const request=(name,body)=>repo.request('integrations/'+name+'?'+new URLSearchParams({branch}),body?{method:'POST',body}:{});
 const states=new Map();let pending=false;
 async function poll(){
  if(pending||!document.querySelector('[data-auto-link]'))return;
  pending=true;try{const {rows}=await request('auto-link');const latest=new Map();for(const row of rows)if(!latest.has(row.serial))latest.set(row.serial,row);
   for(const [serial,r] of latest){const previous=states.get(serial);states.set(serial,r.state);if(previous&&previous!==r.state&&['confirmed','failed','pending'].includes(r.state)){notify(r.result.message);if(r.state==='confirmed')await refresh();}}
   for(const b of document.querySelectorAll('[data-auto-link]')){const row=latest.get(b.dataset.serial);const waiting=row&&['submitted','pending','prepared'].includes(row.state);b.disabled=!!waiting;b.textContent=waiting?(row.state==='pending'?'Conferir vínculo':'Vinculando…'):'Vincular';b.title=row?.result?.message||'Vincular automaticamente usando o lote do tipo';}
  }catch(e){notify(e.message);}finally{pending=false;}
 }
 return {allowed,bind(rows){
  if(!allowed)return;
  document.querySelectorAll('[data-auto-link]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Vinculando…';try{const row=rows.find(r=>r.id===b.dataset.autoLink);const result=await request('auto-link',{id:row.id,version:row.version});states.set(row.serial,'submitted');notify(result.message);await poll();}catch(e){notify(e.message);b.disabled=false;b.textContent='Vincular';}});
  void poll();
 },async lots(){
  try{const {rows}=await request('link-lots');showModal('Lotes de vinculação · '+branch,`<p>Numeração independente por base. GRS: 7.3.2 · XRS: 7.3.5 · AAA: 7.2.2/7.1.6.</p><p>${rows.map(r=>esc(r.prefix)+': '+r.start+'–'+r.end+' · '+r.available+' disponíveis').join('<br>')||'Nenhum lote cadastrado.'}</p><form id="auto-lot-form"><label>Prefixo<select name="prefix"><option>AAA</option><option>GRS</option><option>XRS</option></select></label><label>Início<input name="start" type="number" min="450" value="450" required></label><label>Final<input name="end" type="number" min="450" placeholder="Número final do lote" required></label><p>O lote guarda os códigos existentes. Identificações ausentes serão criadas no titular RS300 somente ao vincular. Até 1.000 números por lote.</p><button class="primary">Cadastrar lote</button><p id="auto-lot-result" role="status"></p></form>`,'medium');
   document.querySelector('#auto-lot-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button'),values=new FormData(form);b.disabled=true;try{const r=await request('link-lots',{prefix:values.get('prefix'),start:Number(values.get('start')),end:Number(values.get('end'))});form.querySelector('#auto-lot-result').textContent=r.message;}catch(e){form.querySelector('#auto-lot-result').textContent=e.message;}finally{b.disabled=false;}};
  }catch(e){notify(e.message);}
 },start(){const page=document.querySelector('#page .stock-card');const tick=async()=>{if(!page?.isConnected)return;if(!document.hidden)await poll();if(page.isConnected)setTimeout(tick,5000);};setTimeout(tick,5000);}};
}
