import {savedView} from './saved-view.js';
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
export function operatorGroups(groups){
 const result=new Map();
 for(const g of groups){const key=JSON.stringify([g.provider,(g.operator||'Não informada').trim().toLocaleUpperCase('pt-BR')]);const row=result.get(key)||{key,provider:g.provider,operator:g.operator||'Não informada',count:0,total:0,groups:[]};row.count+=g.count;row.total+=g.count*g.cents;row.groups.push(g);result.set(key,row);}
 return [...result.values()].sort((a,b)=>b.total-a.total);
}
export function filterBilling(items,{query='',group='',state=''}={}){
 const q=query.trim().toLocaleLowerCase('pt-BR');
 return items.filter(r=>(!state||(state==='confirmed'?r.state==='Confirmado':r.state!=='Confirmado'))&&(!group||JSON.stringify([r.provider,r.operator,r.apn||'Não informada',r.cents])===group)&&[r.iccid,r.operator,r.apn,provider(r.provider),...(r.devices||[]),...(r.associations||[]).map(a=>a.plate)].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q)));
}
export function mountChipBilling(root,{repo,icon}){
 let costs=cachedWarehouseCosts(repo),error='',loading=!costs,page=0,filters={query:'',group:'',state:''};
 const remote=repo.real?savedView(repo,repo.currentBranch,'warehouse-costs',root,draw):null;
 function draw(){
  if(!root.isConnected)return;
  const result=remote?.get({view:'page',page,...filters});if(remote&&!result)return;if(result){costs=result;page=result.page;}const total=result?.total??filterBilling(costs?.items||[],filters).length;
  const items=costs?.items||[],groups=billingGroups(items),operators=result?.operators||operatorGroups(groups),filtered=filterBilling(items,filters);
  page=Math.min(page,Math.max(0,Math.ceil(total/12)-1));
  root.innerHTML=`<div class="wc-billing-summary"><div><small>Tarifas atuais · Todos os fornecedores</small><strong>${costs?.checked_at?money(costs.total_cents):'—'}</strong><small>${costs?.confirmed||0} de ${costs?.chip_count||0} chips ativos com valor</small></div>${(costs?.providers||[]).map(p=>`<div><b>${esc(p.name)}</b><strong>${p.checked_at?money(p.total_cents):'—'}</strong><small>${p.confirmed} chips · ${p.checked_at?esc(new Date(p.checked_at).toLocaleDateString('pt-BR')):'Sem leitura'}</small></div>`).join('')}</div>
  <div class="wc-billing-summary"><div><small>Faturas · vencimento ${esc(costs?.billing?.month||'não informado')}</small><strong>${Number.isInteger(costs?.billing?.total_cents)?money(costs.billing.total_cents):'—'}</strong><small>${costs?.billing?.complete?'Dois fornecedores':'Cobertura parcial'} · separado das tarifas</small></div>${(costs?.billing?.invoices||[]).map(i=>`<div><b>${esc(i.name)} · ${esc(i.id)}</b><strong>${money(i.total_cents)}</strong><small>Vencimento ${esc(i.due_date)} · ${esc(i.status||'Pagamento não confirmado')}</small></div>`).join('')}</div>
  <div class="wc-billing-heading"><div><h2>Tarifas por operadora e APN</h2><small>Clique na operadora para ver os lotes por tarifa e APN.</small></div><button id="cb-refresh" ${loading?'disabled':''}>${icon('refresh')} Atualizar Árya</button></div>
  <div class="wc-operator-table"><table><thead><tr><th>Operadora</th><th>Fornecedor</th><th>Chips</th><th>Tarifas / APNs</th><th>Mensalidade</th></tr></thead><tbody>${operators.map((g,i)=>`<tr data-cb-operator-row="${i}"><td><button class="wc-operator-link" data-cb-operator="${i}">${esc(g.operator)} <span aria-hidden="true">›</span></button></td><td>${provider(g.provider)}</td><td>${g.count.toLocaleString('pt-BR')}</td><td>${g.groups.length}</td><td class="wc-price">${money(g.total)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhuma tarifa confirmada.</td></tr>'}</tbody></table></div>
  <div class="wc-billing-heading"><h2>Chips dos fornecedores e aparelhos associados</h2><button id="cb-clear" class="wc-link">Limpar filtros</button></div>
  <div class="wc-toolbar"><label class="wc-search">${icon('search')}<input id="cb-search" aria-label="Buscar mensalidade por ICCID ou aparelho" placeholder="ICCID, aparelho, placa, operadora ou APN" value="${esc(filters.query)}"></label><select id="cb-state" aria-label="Situação da mensalidade"><option value="">Todos os chips dos fornecedores</option><option value="confirmed" ${filters.state==='confirmed'?'selected':''}>Com valor confirmado</option><option value="pending" ${filters.state==='pending'?'selected':''}>Pendências e não ativos</option></select></div>
  ${filters.group?'<p class="wc-message">Exibindo a tarifa selecionada. Use Limpar filtros para ver todos.</p>':''}
  <div class="wc-billing-table"><table><thead><tr><th>ICCID / provedor</th><th>Operadora / APN</th><th>Aparelho / placa</th><th>Tarifa / fatura</th><th>Situação / consulta</th></tr></thead><tbody>${(remote?filtered:filtered.slice(page*12,page*12+12)).map(r=>`<tr><td><b>${esc(r.iccid)}</b><small>${provider(r.provider)}</small></td><td>${esc(r.operator||'Não informada')}<small>${esc(r.apn||'Não informada')}</small></td><td>${(r.associations?.length?r.associations:(r.devices||[]).map(serial=>({serial}))).map(d=>`<div><b>${esc(d.serial)}</b><small>${esc(d.plate||'Placa não informada')}${d.branch?' · '+esc(d.branch):''}${d.apn?' · '+esc(d.apn):''}</small></div>`).join('')||'Sem aparelho identificado na Central'}</td><td class="wc-price">${Number.isInteger(r.cents)?money(r.cents):'—'}<small>Tarifa mensal atual</small>${(costs?.billing?.invoices||[]).filter(i=>i.provider===r.provider).map(i=>{const entries=(i.items||[]).filter(x=>x.iccid===r.iccid);return `<small>Fatura ${esc(i.id)}: ${entries.length?money(entries.reduce((n,x)=>n+x.cents,0)):i.items?'ICCID não listado':'Sem detalhe por chip'}</small>`;}).join('')}</td><td><span class="wc-status ${r.state==='Confirmado'?'teal':'amber'}">${esc(r.state)}</span><small>${esc(r.plan||'')} · ${esc(r.provider_status||'')}</small><small>${esc(r.connection||'')} · Última conexão: ${esc(r.last_connection||'Não informada')}</small><small>${r.imei?'IMEI informado: '+esc(r.imei):''}</small><small>${r.checked_at?esc(new Date(r.checked_at).toLocaleString('pt-BR')):'Sem leitura confirmada'}</small></td></tr>`).join('')||'<tr><td colspan="5" class="empty">Nenhum chip encontrado para estes filtros.</td></tr>'}</tbody></table></div>
  <div class="wc-bottom"><span class="wc-pager"><small>${total} chips · página ${page+1} de ${Math.max(1,Math.ceil(filtered.length/12))}</small><button id="cb-prev" ${page===0?'disabled':''} aria-label="Página anterior de mensalidades">‹</button><button id="cb-next" ${(page+1)*12>=total?'disabled':''} aria-label="Próxima página de mensalidades">›</button></span></div>
  <p class="wc-message" role="status">${esc(error||(loading?'Lendo valores…':''))}</p>
  ${(costs?.providers||[]).filter(p=>p.error||p.refreshing).map(p=>`<p class="wc-message">${esc(p.name+': '+(p.error||'consulta em andamento'))}</p>`).join('')}
  <small class="wc-billing-footnote">Tarifas atuais não são faturas. Faturas preservam os valores e períodos consultados. APN e aparelho conforme cadastro da Central; IMEI do fornecedor é informativo. Link usa relatório salvo.</small>`;
  root.querySelectorAll('[data-cb-operator]').forEach(b=>b.onclick=()=>openOperator(operators[Number(b.dataset.cbOperator)]));
  root.querySelectorAll('[data-cb-operator-row]').forEach(row=>row.onclick=e=>{if(!e.target.closest('button'))row.querySelector('button').click();});
  root.querySelector('#cb-search').oninput=e=>{filters.query=e.target.value;page=0;const pos=e.target.selectionStart;draw();const i=root.querySelector('#cb-search');i.focus();i.setSelectionRange(pos,pos);};
  root.querySelector('#cb-state').onchange=e=>{filters.state=e.target.value;page=0;draw();};
  root.querySelector('#cb-clear').onclick=()=>{filters={query:'',group:'',state:''};page=0;draw();};
  root.querySelector('#cb-prev').onclick=()=>{page--;draw();};root.querySelector('#cb-next').onclick=()=>{page++;draw();};
  root.querySelector('#cb-refresh').onclick=()=>read(true);
 }
 function openOperator(operator){
  const dialog=document.createElement('dialog');dialog.className='wc-tariff-dialog';dialog.setAttribute('aria-labelledby','cb-dialog-title');
  dialog.innerHTML=`<header><div><small>${esc(provider(operator.provider))} · Mensalidades dos chips</small><h2 id="cb-dialog-title">${esc(operator.operator)}</h2></div><button type="button" data-cb-close aria-label="Fechar detalhes">×</button></header><div class="wc-lot-summary"><div><small>Chips com tarifa confirmada</small><strong>${operator.count.toLocaleString('pt-BR')}</strong></div><div><small>Grupos de tarifa / APN</small><strong>${operator.groups.length}</strong></div><div><small>Total mensal estimado</small><strong>${money(operator.total)}</strong></div></div><h3>Lotes por tarifa e APN</h3><p>Agrupados pelo valor mensal e pela APN; não representam lotes de compra.</p><div class="wc-lot-table"><table><thead><tr><th>APN</th><th>Chips</th><th>Valor por chip</th><th>Total mensal</th><th></th></tr></thead><tbody>${operator.groups.map((g,i)=>`<tr><td>${esc(g.apn)}</td><td>${g.count.toLocaleString('pt-BR')}</td><td>${money(g.cents)}</td><td><strong>${money(g.cents*g.count)}</strong></td><td><button data-cb-group="${i}">Ver chips</button></td></tr>`).join('')}</tbody></table></div><footer>Valores dos dados salvos. Faturas e cobranças adicionais são apresentadas separadamente.</footer>`;
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.querySelector('[data-cb-close]').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}};
  dialog.querySelectorAll('[data-cb-group]').forEach(b=>b.onclick=()=>{filters.group=operator.groups[Number(b.dataset.cbGroup)].key;filters.query='';filters.state='';page=0;dialog.close();draw();root.querySelector('#cb-search').focus();});dialog.showModal();
 }
 async function read(refresh=false){if(refresh&&loading)return;loading=true;error='';draw();try{await loadWarehouseCosts(repo,{refresh});costs=cachedWarehouseCosts(repo);}catch(e){error=e.message;}finally{loading=false;remote?.refresh();draw();}}
 draw();if(!remote&&!costs)read();
}
