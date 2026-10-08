const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function setupAutoLink({repo,branch,showModal,notify,refresh}){
 const allowed=repo.real&&(repo.user?.permissions?.owner||repo.user?.permissions?.writes?.includes('stock'));
 const request=(name,body)=>repo.request('integrations/'+name+'?'+new URLSearchParams({branch}),body?{method:'POST',body}:{});
 const states=new Map(),tracked=new Set();let pending=false,submitting=false,lastRows=[],selectionButton=null,card=null,lastPoll=0;
 const status=r=>r.state==='submitted'?(r.running?'Vinculando…':'Na fila'):r.state==='pending'?'Conferir vínculo':r.state==='confirmed'?'Vinculado':r.state==='failed'?'Falha':r.state==='cancelled'?'Cancelado':'Na fila';
 function paint(){
  for(const b of document.querySelectorAll('[data-auto-link]')){const r=lastRows.find(r=>r.serial===b.dataset.serial),waiting=r&&['submitted','pending','prepared'].includes(r.state);b.disabled=!!waiting||submitting;b.textContent=r&&(waiting||tracked.has(r.id))?status(r):'Vincular';b.title=r?.result?.message||'Vincular automaticamente usando o lote do tipo';}
  const progress=document.querySelector('#stock-link-progress');
  if(progress){const rows=lastRows.filter(r=>tracked.has(r.id)),queued=rows.filter(r=>r.state==='submitted'&&!r.running).length,running=rows.filter(r=>r.state==='submitted'&&r.running).length,done=rows.filter(r=>r.state==='confirmed').length,issues=rows.filter(r=>['pending','failed'].includes(r.state)).length;const controls=document.querySelector('#stock-link-controls');controls.hidden=!tracked.size&&!lastRows.some(r=>['submitted','pending','prepared'].includes(r.state));const cancel=document.querySelector('#stock-link-cancel');cancel.disabled=submitting||!lastRows.some(r=>['submitted','prepared'].includes(r.state));progress.textContent='Vinculação · '+queued+' na fila · '+running+' vinculando · '+done+' vinculados · '+issues+' para conferir · '+rows.filter(r=>r.state==='cancelled').length+' cancelados';}
 }
 async function poll(force=false){
  if(pending||!card?.isConnected||(!force&&Date.now()-lastPoll<4500))return;lastPoll=Date.now();
  pending=true;try{const {rows}=await request('auto-link');if(!card?.isConnected)return;const latest=new Map();for(const row of rows)if(!latest.has(row.serial))latest.set(row.serial,row);lastRows=[...latest.values()];let changed=false;
   for(const r of lastRows){const previous=states.get(r.id);states.set(r.id,r.state);if(r.state==='submitted')tracked.add(r.id);if(previous&&previous!==r.state&&r.state==='confirmed')changed=true;}
   paint();if(changed)await refresh();
  }catch(e){notify(e.message);}finally{pending=false;}
 }
 async function submit(rows){
  if(submitting)return;
  if(!rows.length)return notify('Selecione aparelhos em Estoque, Reserva ou Manutenção.');
  if(rows.length>50)return notify('Selecione até 50 aparelhos por lote.');
  submitting=true;if(selectionButton)selectionButton.disabled=true;paint();
  try{const result=await request('auto-link',{items:rows.map(r=>({id:r.id,version:r.version}))});
   const results=result.results||[];for(const r of results)if(r.ok){tracked.add(r.id);states.set(r.id,'submitted');}
   const rejected=results.filter(r=>!r.ok);notify(result.message);
   if(rejected.length)showModal('Pendências da vinculação','<p>Os demais aparelhos continuam na fila.</p><ul>'+rejected.map(r=>'<li>'+esc(rows.find(d=>d.id===r.device_id)?.serial)+': '+esc(r.message)+'</li>').join('')+'</ul>','medium');
   await poll(true);
  }catch(e){notify(e.message+' Atualize o progresso antes de repetir.');await poll();}
  finally{submitting=false;if(selectionButton)selectionButton.disabled=false;paint();}
 }
 return {allowed,bind(rows){
  if(!allowed)return;card??=document.querySelector('#page .stock-card');
  document.querySelectorAll('[data-auto-link]').forEach(b=>b.onclick=()=>submit(rows.filter(r=>r.id===b.dataset.autoLink)));
  const cancel=document.querySelector('#stock-link-cancel');if(cancel)cancel.onclick=async()=>{if(submitting)return;submitting=true;cancel.disabled=true;try{const result=await request('auto-link',{cancel:true});notify(result.message);await poll(true);}catch(e){notify(e.message);}finally{submitting=false;paint();}};
  paint();void poll();
 },selection(getRows){
  selectionButton=document.querySelector('#stock-link-selected');if(selectionButton){selectionButton.disabled=submitting;selectionButton.onclick=()=>submit(getRows());}
 },async lots(){
  try{const {rows}=await request('link-lots');showModal('Lotes de vinculação · '+branch,`<p>Numeração independente por base. GRS: 7.3.2 · XRS: 7.3.5 · AAA: 7.2.2/7.1.6.</p><p>${rows.map(r=>esc(r.prefix)+': '+r.start+'–'+r.end+' · '+r.available+' disponíveis').join('<br>')||'Nenhum lote cadastrado.'}</p><form id="auto-lot-form"><label>Prefixo<select name="prefix"><option>AAA</option><option>GRS</option><option>XRS</option></select></label><label>Início<input name="start" type="number" min="450" value="450" required></label><label>Final<input name="end" type="number" min="450" placeholder="Número final do lote" required></label><p>O lote guarda os códigos existentes. Identificações ausentes serão criadas no titular RS300 somente ao vincular. Até 1.000 números por lote.</p><button class="primary">Cadastrar lote</button><p id="auto-lot-result" data-notice role="status"></p></form>`,'medium');
   document.querySelector('#auto-lot-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,b=form.querySelector('button'),values=new FormData(form);b.disabled=true;try{const r=await request('link-lots',{prefix:values.get('prefix'),start:Number(values.get('start')),end:Number(values.get('end'))});form.querySelector('#auto-lot-result').textContent=r.message;}catch(e){form.querySelector('#auto-lot-result').textContent=e.message;}finally{b.disabled=false;}};
  }catch(e){notify(e.message);}
 },start(){const page=document.querySelector('#page .stock-card');const tick=async()=>{if(!page?.isConnected)return;if(!document.hidden)await poll();if(page.isConnected)setTimeout(tick,5000);};setTimeout(tick,5000);}};
}
