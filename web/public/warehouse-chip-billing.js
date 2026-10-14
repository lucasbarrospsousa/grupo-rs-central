import {cachedWarehouseCosts,loadWarehouseCosts} from './warehouse-cost-cache.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
const provider=p=>p==='link'?'Link Solutions':p==='arya'?'Árya':'A confirmar';
export function billingGroups(items){
 const groups=new Map();
 for(const r of items.filter(r=>r.state==='Confirmado'&&Number.isInteger(r.cents))){
  const apn=r.apn||'Não informada',key=JSON.stringify([r.provider,r.operator,apn,r.cents]);
  const g=groups.get(key)||{key,provider:r.provider,operator:r.operator,apn,cents:r.cents,count:0};g.count++;groups.set(key,g);
 }
 return [...groups.values()].sort((a,b)=>b.count-a.count);
}
export function filterBilling(items,{query='',group='',state=''}={}){
 const q=query.trim().toLocaleLowerCase('pt-BR');
 return items.filter(r=>(!state||(state==='confirmed'?r.state==='Confirmado':r.state!=='Confirmado'))&&(!group||JSON.stringify([r.provider,r.operator,r.apn||'Não informada',r.cents])===group)&&[r.iccid,r.operator,r.apn,provider(r.provider),...(r.devices||[]),...(r.associations||[]).map(a=>a.plate)].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
}
export function mountChipBilling(root,{repo,icon}){
 let costs=cachedWarehouseCosts(repo),error='',loading=!costs,page=0,filters={query:'',group:'',state:''};
 function draw(){
  if(!root.isConnected)return;
  const items=costs?.items||[],groups=billingGroups(items),filtered=filterBilling(items,filters);
  page=Math.min(page,Math.max(0,Math.ceil(filtered.length/12)-1));
  root.innerHTML=`<div class="wc-billing-summary"><div><small>Tarifas atuais · Todos os fornecedores</small><strong>${costs?.checked_at?money(costs.total_cents):'—'}</strong><small>${costs?.confirmed||0} de ${costs?.chip_count||0} chips ativos com valor</small></div>${(costs?.providers||[]).map(p=>`<div><b>${esc(p.name)}</b><strong>${p.checked_at?money(p.total_cents):'—'}</strong><small>${p.confirmed} chips · ${p.checked_at?esc(new Date(p.checked_at).toLocaleDateString('pt-BR')):'Sem leitura'}</small></div>`).join('')}</div>
  <div class="wc-billing-summary"><div><small>Faturas · vencimento ${esc(costs?.billing?.month||'não informado')}</small><strong>${Number.isInteger(costs?.billing?.total_cents)?money(costs.billing.total_cents):'—'}</strong><small>${costs?.billing?.complete?'Dois fornecedores':'Cobertura parcial'} · separado das tarifas</small></div>${(costs?.billing?.invoices||[]).map(i=>`<div><b>${esc(i.name)} · ${esc(i.id)}</b><strong>${money(i.total_cents)}</strong><small>Vencimento ${esc(i.due_date)} · ${esc(i.status||'Pagamento não confirmado')}</small></div>`).join('')}</div>
  <div class="wc-billing-heading"><div><h2>Tarifas por operadora e APN</h2><small>Selecione uma tarifa para ver seus chips. Cada ICCID é contado uma vez.</small></div><button id="cb-refresh" ${loading?'disabled':''}>${icon('refresh')} Atualizar Árya</button></div>
  <div class="wc-tariffs">${groups.map(g=>`<button data-cb-group="${esc(g.key)}" aria-pressed="${filters.group===g.key}"><span><b>${esc(g.operator||'Operadora não informada')}</b><small>${provider(g.provider)} · ${esc(g.apn)}</small></span><span><b>${money(g.cents)} / chip</b><small>${g.count} chips · ${money(g.count*g.cents)}/mês</small></span></button>`).join('')||'<p>Nenhuma tarifa confirmada.</p>'}</div>
  <div class="wc-billing-heading"><h2>Chips dos fornecedores e aparelhos associados</h2><button id="cb-clear" class="wc-link">Limpar filtros</button></div>
  <div class="wc-toolbar"><label class="wc-search">${icon('search')}<input id="cb-search" aria-label="Buscar mensalidade por ICCID ou aparelho" placeholder="ICCID, aparelho, placa, operadora ou APN" value="${esc(filters.query)}"></label><select id="cb-state" aria-label="Situação da mensalidade"><option value="">Todos os chips dos fornecedores</option><option value="confirmed" ${filters.state==='confirmed'?'selected':''}>Com valor confirmado</option><option value="pending" ${filters.state==='pending'?'selected':''}>Pendências e não ativos</option></select></div>
  ${filters.group?'<p class="wc-message">Exibindo a tarifa selecionada. Use Limpar filtros para ver todos.</p>':''}
  <div class="wc-billing-table"><table><thead><tr><th>ICCID / provedor</th><th>Operadora / APN</th><th>Aparelho / placa</th><th>Tarifa / fatura</th><th>Situação / consulta</th></tr></thead><tbody>${filtered.slice(page*12,page*12+12).map(r=>`<tr><td><b>${esc(r.iccid)}</b><small>${provider(r.provider)}</small></td><td>${esc(r.operator||'Não informada')}<small>${esc(r.apn||'Não informada')}</small></td><td>${(r.associations?.length?r.associations:(r.devices||[]).map(serial=>({serial}))).map(d=>`<div><b>${esc(d.serial)}</b><small>${esc(d.plate||'Placa não informada')}${d.branch?' · '+esc(d.branch):''}${d.apn?' · '+esc(d.apn):''}</small></div>`).join('')||'Sem aparelho identificado na Central'}</td><td class="wc-price">${Number.isInteger(r.cents)?money(r.cents):'—'}<small>Tarifa mensal atual</small>${(costs?.billing?.invoices||[]).filter(i=>i.provider===r.provider).map(i=>{const entries=(i.items||[]).filter(x=>x.iccid===r.iccid);return `<small>Fatura ${esc(i.id)}: ${entries.length?money(entries.reduce((n,x)=>n+x.cents,0)):i.items?'ICCID não listado':'Sem detalhe por chip'}</small>`;}).join('')}</td><td><span class="wc-status ${r.state==='Confirmado'?'teal':'amber'}">${esc(r.state)}</span><small>${esc(r.plan||'')} · ${esc(r.provider_status||'')}</small><small>${esc(r.connection||'')} · Última conexão: ${esc(r.last_connection||'Não informada')}</small><small>${r.imei?'IMEI informado: '+esc(r.imei):''}</small><small>${r.checked_at?esc(new Date(r.checked_at).toLocaleString('pt-BR')):'Sem leitura confirmada'}</small></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum chip encontrado para estes filtros.</td></tr>'}</tbody></table></div>
  <div class="wc-bottom"><span class="wc-pager"><small>${filtered.length} chips · página ${page+1} de ${Math.max(1,Math.ceil(filtered.length/12))}</small><button id="cb-prev" ${page===0?'disabled':''} aria-label="Página anterior de mensalidades">‹</button><button id="cb-next" ${(page+1)*12>=filtered.length?'disabled':''} aria-label="Próxima página de mensalidades">›</button></span></div>
  <p class="wc-message" role="status">${esc(error||(loading?'Lendo valores…':''))}</p>
  ${(costs?.providers||[]).filter(p=>p.error||p.refreshing).map(p=>`<p class="wc-message">${esc(p.name+': '+(p.error||'consulta em andamento'))}</p>`).join('')}
  <small class="wc-billing-footnote">Tarifas atuais não são faturas. Faturas preservam os valores e períodos consultados. APN e aparelho conforme cadastro da Central; IMEI do fornecedor é informativo. Link usa relatório salvo.</small>`;
  root.querySelectorAll('[data-cb-group]').forEach(b=>b.onclick=()=>{filters.group=filters.group===b.dataset.cbGroup?'':b.dataset.cbGroup;page=0;draw();});
  root.querySelector('#cb-search').oninput=e=>{filters.query=e.target.value;page=0;const pos=e.target.selectionStart;draw();const i=root.querySelector('#cb-search');i.focus();i.setSelectionRange(pos,pos);};
  root.querySelector('#cb-state').onchange=e=>{filters.state=e.target.value;page=0;draw();};
  root.querySelector('#cb-clear').onclick=()=>{filters={query:'',group:'',state:''};page=0;draw();};
  root.querySelector('#cb-prev').onclick=()=>{page--;draw();};root.querySelector('#cb-next').onclick=()=>{page++;draw();};
  root.querySelector('#cb-refresh').onclick=()=>read(true);
 }
 async function read(refresh=false){if(refresh&&loading)return;loading=true;error='';draw();try{await loadWarehouseCosts(repo,{refresh});costs=cachedWarehouseCosts(repo);}catch(e){error=e.message;}finally{loading=false;draw();}}
 draw();if(!costs)read();
}
