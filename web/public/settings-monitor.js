import {startEconomyPolling} from './usage-control.mjs';
import {fresh,sourceHealth} from './settings-health-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const baseNames={imperatriz:'Imperatriz',araguaina:'Araguaína',acailandia:'Açailândia',maraba:'Marabá'};
const baseOptions=Object.entries(baseNames).map(([id,label])=>'<option value="'+id+'">'+label+'</option>').join('');
const num=v=>Number(v||0).toLocaleString('pt-BR');
const date=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}):'Não informado';
const pill=(text,tone='unknown')=>`<span class="monitor-pill" data-tone="${tone}">${esc(text)}</span>`;
const sources=[['api','API Grupo RS','#087eff'],['portal','Portal Grupo RS','#83b7ef'],['arya','Arya / Hinova','#ffab29'],['link','Link Solutions','#16a68c'],['other','Outras','#9371d5']];
export function scanState(d){
 if(!d.enabled)return 'Pausado';
 if(Date.parse(d.lease_until)>Date.parse(d.server_at))return 'Consultando lote';
 if(d.new_pending)return 'Novos aparelhos na fila';
 if(!d.nightly_enabled)return 'Revisão noturna desativada';
 if(!d.window_open)return 'Aguardando janela noturna';
 return d.review_completed_at?'Revisão concluída':'Revisão noturna em andamento';
}
export function mountGeneralMonitor(ctx,root){
 root.classList.add('general-monitor');
 root.innerHTML=`<div class="monitor-top">
 <section class="settings-panel monitor-device"><h2>Central de operações</h2><p>Monitoramento das 4 bases</p><img src="tracker-hologram.png" alt="Ilustração holográfica de um rastreador" width="1280" height="1280"><div data-server-state>Leitura do servidor pendente</div><small data-priority-state>Prioridade das consultas</small></section>
 <section class="settings-panel monitor-scan"><div class="monitor-heading"><h2>Códigos, vínculos e APN</h2><select data-monitor-base aria-label="Base da sondagem">${baseOptions}</select></div><div data-monitor-scan><p>Carregando estado salvo…</p></div></section>
 <section class="settings-panel monitor-schedule"><h2>Programação</h2><form data-monitor-form>
 <label class="monitor-toggle"><input type="checkbox" name="nightly_enabled"> Revisão noturna</label>
 <div class="monitor-time"><label>Início<input type="time" name="night_start" value="22:00" required></label><label>Fim<input type="time" name="night_end" value="04:00" required></label></div>
 <div class="monitor-time"><label>Lote<input type="number" name="batch_limit" value="10" min="1" max="10" required><small>1 a 10 aparelhos</small></label><label>Intervalo<input type="number" name="interval_seconds" value="25" min="25" max="3600" required><small>segundos</small></label></div>
 <small>Fortaleza • um lote por base; bases em paralelo</small>
 <label class="monitor-toggle monitor-priority"><input name="priority" type="checkbox"> Priorizar ações manuais</label>
 <div class="monitor-buttons"><button class="primary" type="submit" disabled>Salvar programação</button><button type="button" data-monitor-pause disabled>Pausar</button></div><small>Retoma de onde parou. Novos aparelhos entram primeiro.</small><p data-monitor-message role="status"></p></form></section></div>
 <div class="monitor-bottom"><section class="settings-panel monitor-bases"><div class="monitor-heading"><h2>Monitoramento por base</h2><small>Estoque e manutenções</small></div><div data-monitor-bases>Carregando…</div><div class="monitor-foot"><small data-monitor-interval></small><button data-monitor-tab="queue">Ajustar prioridades →</button></div></section>
 <section class="settings-panel monitor-integrations"><h2>Integrações</h2><div data-monitor-integrations>Carregando…</div><div class="monitor-foot"><small>Evidências salvas • 4 bases</small><button data-monitor-tab="connections">Ver conexões →</button></div></section>
 <section class="settings-panel monitor-consumption"><div class="monitor-heading"><h2>Consumo de consultas</h2><small>30 dias</small></div><div data-monitor-consumption>Carregando…</div><div class="monitor-foot"><button data-monitor-tab="consumption">Ver consumo →</button><button data-monitor-tab="token">Gerenciar token →</button></div></section></div><p class="monitor-error" data-monitor-error role="alert"></p>`;
 let snapshot,busy=false,saving=false,dirty=false,selected=baseNames[ctx.branch]?ctx.branch:'imperatriz';
 const selector=root.querySelector('[data-monitor-base]'),drafts=new Map();selector.value=selected;
 const form=root.querySelector('form'),alive=()=>root.isConnected;
 const goto=id=>root.dispatchEvent(new CustomEvent('settings-tab',{bubbles:true,detail:id}));
 root.querySelectorAll('[data-monitor-tab]').forEach(b=>b.onclick=()=>goto(b.dataset.monitorTab));
 form.oninput=()=>{dirty=true;};
 function paint(){
  if(!alive()||!snapshot)return;
  const d=snapshot.scans?.find(s=>s.branch_id===selected)||snapshot.scan,q=snapshot.queue,a=snapshot.automation,now=Date.parse(snapshot.server_at);
  root.querySelector('[data-server-state]').innerHTML=pill('Leitura recebida','good')+' <small>'+esc(new Date(snapshot.server_at).toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza'}))+'</small>';
  root.querySelector('[data-priority-state]').textContent=q.priority?'Consultas manuais têm prioridade':'Prioridade manual desativada';
  const reviewed=d.review_cycle>0?d.review_done:d.processed;
  root.querySelector('[data-monitor-scan]').innerHTML=`<div class="monitor-scan-status">${pill(scanState(d),d.enabled?'warning':'unknown')}</div><div class="monitor-metrics">${[[d.total,'Total'],[d.confirmed,'Confirmados'],[d.apn_saved,'APNs salvas'],[d.errors+d.divergent+d.unlinked,'Conferir']].map(([v,l])=>`<article><strong>${num(v)}</strong><span>${l}</span></article>`).join('')}</div><div class="monitor-progress-label"><span>${d.review_cycle>0?'Revisão noturna':'Carga inicial'} · ${num(reviewed)} / ${num(d.total)}</span><span>${d.total?Math.floor(reviewed/d.total*100):0}%</span></div><progress aria-label="Aparelhos processados na revisão" max="${Math.max(1,d.total)}" value="${reviewed}"></progress><small class="monitor-run-time">Último lote: ${d.last_duration_ms==null?'—':(d.last_duration_ms/1000).toFixed(1)+' s'} • ${num(d.batch_done)} / ${num(d.batch_size)} processados</small><div class="monitor-flags">${[['divergent',d.divergent,'Placas divergentes'],['unlinked',d.unlinked,'Sem vínculo'],['error',d.errors,'Falhas de consulta']].map(([k,v,l])=>`<button data-detail="${k}" class="${k}"><b>${num(v)}</b><span>${l}</span></button>`).join('')}</div><div class="monitor-flow"><div><b>Novos aparelhos</b><small>Consulta prioritária · ${num(d.new_pending)} pendentes</small></div><div><b>Já cadastrados</b><small>Revisão noturna · ${esc((d.night_start||'22:00').slice(0,5))}–${esc((d.night_end||'04:00').slice(0,5))}</small></div></div><div class="monitor-foot"><small>Códigos e APN na mesma consulta</small><button data-detail="">Ver detalhes →</button></div><small class="monitor-next">${d.nightly_enabled?'Próxima janela: '+esc(date(d.next_window_at)):'Somente aparelhos novos'} • processado não significa confirmado</small>`;
  root.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{goto('batches');root.dispatchEvent(new CustomEvent('scan-filter',{bubbles:true,detail:{state:b.dataset.detail||null,branch:selected}}));});
  if(!dirty&&!saving){for(const key of ['night_start','night_end'])form.elements[key].value=(d[key]||'').slice(0,5);form.elements.nightly_enabled.checked=!!d.nightly_enabled;form.elements.priority.checked=!!q.priority;form.elements.batch_limit.value=d.batch_limit;form.elements.interval_seconds.value=d.interval_seconds;}
  if(drafts.has(selected)){const draft=drafts.get(selected);for(const [k,v] of Object.entries(draft)){if(form.elements[k].type==='checkbox')form.elements[k].checked=v;else form.elements[k].value=v;}}
  selector.disabled=saving;form.querySelectorAll('button').forEach(b=>b.disabled=saving);form.querySelector('[data-monitor-pause]').textContent=d.enabled?'Pausar':'Retomar';
  root.querySelector('[data-monitor-bases]').innerHTML='<table><thead><tr><th>Base</th><th>Sondagem</th><th>Estoque</th><th>Manutenções</th><th>Fila</th></tr></thead><tbody>'+snapshot.branches.map(b=>{
   const scan=snapshot.scans?.find(s=>s.branch_id===b.id);
   const queue=q.branches?.find(x=>x.branch===b.id)||{};
   const stock=!q.stock?pill('Pausado'):!b.stock_total?pill('Sem aparelhos'):Number(b.stock_recent)===Number(b.stock_total)?pill('Leitura recente','good'):pill('Leitura pendente','warning');
   const maintenance=!q.maintenance?pill('Pausado'):b.maintenance_warning?pill('Com pendência','warning'):fresh(b.maintenance_at,now,3600000)?pill('Leitura recente','good'):pill('Leitura pendente','warning');
   return `<tr><td><button class="monitor-base-link" data-pick-base="${esc(b.id)}">${esc(b.name)}</button></td><td title="${esc(scan?scanState(scan):'Sem leitura')}">${scan?num(scan.processed)+'/'+num(scan.total):'—'}</td><td title="${esc(num(b.stock_recent)+' de '+num(b.stock_total)+' com leitura recente; última: '+date(b.stock_checked_at))}">${stock}</td><td title="${esc(date(b.maintenance_at))}">${maintenance}</td><td title="${Number(queue.manual||0)} manuais e ${Number(queue.automatic||0)} automáticas em curso">${num(queue.waiting)}${queue.automatic?' · ativa':''}</td></tr>`;
  }).join('')+'</tbody></table>';
  root.querySelectorAll('[data-pick-base]').forEach(b=>b.onclick=()=>selectBase(b.dataset.pickBase));
  root.querySelector('[data-monitor-interval]').textContent='Comunicação: '+(a.sync.interval_minutes||'—')+' min • chips: 1 hora';
  const checks=[['equipment','API de aparelhos'],['api','API Grupo RS'],['portal','Portal Grupo RS'],['arya','Arya / Hinova'],['link','Link Solutions']];
  root.querySelector('[data-monitor-integrations]').innerHTML=checks.map(([key,label])=>{
   const s=sourceHealth(key,{sources:snapshot.sources},null,now);
   const alerts=(a.sync.alerts||[]).filter(x=>key==='arya'||key==='link'?x.source==='carrier:'+key:x.source?.startsWith((key==='equipment'?'api':key)+':'));
   const health=alerts.length?{tone:'warning',label:'Acesso pendente'}:s;
   return `<div><span>${label}</span>${pill(health.label,health.tone)}</div>`;
  }).join('')+`<div><span>Ponte SMS · Imperatriz</span>${pill(snapshot.gateway?.connected&&snapshot.gateway.mode==='cloud'?(snapshot.gateway.ok?'Online · pronto':'Online · diagnóstico'):snapshot.gateway?.ok?'Sinal recente':'Sem sinal recente',snapshot.gateway?.ok?'good':'warning')}</div>`;
  const usage=a.usage||[],total=usage.reduce((n,r)=>n+Number(r.total),0),failed=usage.reduce((n,r)=>n+Number(r.failed),0);let at=0;const slices=[];
  const legend=sources.map(([key,label,color])=>{const count=usage.filter(r=>r.source===key).reduce((n,r)=>n+Number(r.total),0);if(count){const end=at+count/total*100;slices.push(`${color} ${at}% ${end}%`);at=end;}return count||key!=='other'?`<div><i style="background:${color}"></i><span>${label}</span><b>${num(count)}</b></div>`:'';}).join('');
  root.querySelector('[data-monitor-consumption]').innerHTML=`<div class="monitor-chart"><div class="monitor-donut" style="background:conic-gradient(${slices.join(',')||'#e7eef7 0% 100%'})"><span><b>${num(total)}</b><small>requisições</small></span></div><div class="monitor-legend">${legend}</div></div><div class="monitor-failures">${num(failed)} falhas de transporte / HTTP</div>`;
 }
 async function refresh(){if(busy||saving||!alive())return;busy=true;try{const result=await ctx.repo.request('settings-monitor');if(!alive())return;snapshot=result;root.querySelector('[data-monitor-error]').textContent='';paint();root.dispatchEvent(new CustomEvent('monitor-updated',{bubbles:true,detail:snapshot.server_at}));}catch(e){if(alive()){root.querySelector('[data-monitor-error]').textContent='Monitor não atualizado: '+e.message+(snapshot?' • exibindo a última leitura.':'');root.querySelector('[data-server-state]').innerHTML=pill('Leitura não atualizada','warning');}}finally{busy=false;}}
 async function save(pause=false){if(saving||!snapshot)return;if(!pause&&!form.reportValidity())return;saving=true;form.querySelectorAll('button').forEach(b=>b.disabled=true);const message=form.querySelector('[data-monitor-message]');
  const scan=snapshot.scans?.find(s=>s.branch_id===selected)||snapshot.scan;
  const body=pause?{enabled:!scan.enabled,interval_seconds:scan.interval_seconds}:{enabled:scan.enabled,nightly_enabled:form.elements.nightly_enabled.checked,night_start:form.elements.night_start.value,night_end:form.elements.night_end.value,batch_limit:Number(form.elements.batch_limit.value),interval_seconds:Number(form.elements.interval_seconds.value),priority:form.elements.priority.checked};
  try{await ctx.repo.request('code-scan?branch='+encodeURIComponent(selected),{method:'POST',body});if(!alive())return;if(!pause){dirty=false;drafts.delete(selected);}message.textContent=pause?'Estado da consulta salvo.':'Programação salva no servidor.';}catch(e){if(alive())message.textContent='Não foi possível salvar: '+e.message;}finally{saving=false;if(alive()){form.querySelectorAll('button').forEach(b=>b.disabled=false);await refresh();}}
 }
 function selectBase(branch){if(saving||!baseNames[branch])return;if(dirty)drafts.set(selected,Object.fromEntries(['nightly_enabled','night_start','night_end','batch_limit','interval_seconds','priority'].map(k=>[k,form.elements[k].type==='checkbox'?form.elements[k].checked:form.elements[k].value])));selected=branch;selector.value=selected;dirty=false;paint();dirty=drafts.has(selected);form.querySelector('[data-monitor-message]').textContent='';}
 selector.onchange=()=>selectBase(selector.value);
 form.onsubmit=e=>{e.preventDefault();void save();};form.querySelector('[data-monitor-pause]').onclick=()=>void save(true);
 startEconomyPolling(refresh,{interval:30000,alive,active:()=>!root.hidden});void refresh();return{refresh};
}
