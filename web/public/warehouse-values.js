import {savedView} from './saved-view.js';
import {loadWarehouseCosts} from './warehouse-cost-cache.js';
import {mountChipBilling} from './warehouse-chip-billing.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
export function equipmentValue(counts){return Object.entries(counts||{}).filter(([k])=>k!=='total').map(([name,count])=>({name,count,cents:count*10000}));}
export function mountWarehouseValues(root,{repo,icon}){
 let cost=null,error='',started=false;
 const remote=repo.real?savedView(repo,repo.currentBranch,'warehouse',root,draw):null;
 const canView=repo.user?.permissions?.owner;
 function draw(){if(root.hidden||!root.isConnected)return;if(!canView){root.innerHTML='<section class="panel">Valores restritos à administração.</section>';return;}
 const data=remote?.get({view:'items',kind:'device',status:'Disponível',page:0});if(remote&&!data)return;
 if(!started){started=true;loadWarehouseCosts(repo).then(c=>{cost=c;draw();}).catch(e=>{error=e.message;draw();});}
 const counts=data?.counts?.device,groups=equipmentValue(counts),count=counts?.total,total=Number.isInteger(count)?count*10000:null;
 let angle=0;const palette=['#00a493','#8951d0','#ef9a14'],gradient=groups.map((g,i)=>{const start=angle;angle+=count?g.count/count*360:0;return palette[i%palette.length]+' '+start+'deg '+angle+'deg';}).join(',');
 const value=cost?.checked_at?money(cost.total_cents):'—',month=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'America/Fortaleza'}).format(new Date());
 const card=(label,n,sub,tone)=>`<article class="wv-card ${tone}"><small>${label}</small><strong>${n}</strong><span>${sub}</span></article>`;
 root.innerHTML=`<div class="wv-period">${esc(month)} · Custos dos fornecedores: todas as bases autorizadas · Aparelhos: armazém de Imperatriz</div><div class="wv-metrics">
 ${card('Chips ativos',cost?Number(cost.active_count??cost.confirmed+cost.without_price).toLocaleString('pt-BR'):'—','Situação cadastral confirmada','blue')}
 ${card('Custo mensal conhecido',value,'Tarifas salvas dos chips ativos','teal')}
 ${card('Fatura prevista • estimativa',value,'Projeção pelas tarifas atuais; não é fatura emitida','violet')}
 ${card('Valor dos aparelhos',total===null?'—':money(total),(count??'—')+' aparelhos × R$ 100,00','amber')}
 </div><div class="wv-grid"><section class="panel"><h2>Custo por fornecedor</h2>${(cost?.providers||[]).map(p=>`<div class="wv-bar-row"><span>${esc(p.name)}</span><div class="wv-track"><i style="width:${cost.total_cents?Math.max(1,p.total_cents/cost.total_cents*100):0}%"></i></div><b>${p.checked_at?money(p.total_cents):'—'}</b></div><small>${p.confirmed} chips com tarifa · ${p.checked_at?esc(new Date(p.checked_at).toLocaleString('pt-BR')):'Sem leitura salva'}</small>`).join('')||'<p>Carregando valores salvos…</p>'}</section><section class="panel"><h2>Aparelhos por classificação</h2><div class="wv-distribution"><div class="wv-donut" role="img" aria-label="${esc(groups.map(g=>g.name+': '+g.count).join(', '))}" style="background:conic-gradient(${count?gradient:'#e6eef7'})"><span><b>${count??'—'}</b><small>aparelhos</small></span></div><div class="wv-legend">${groups.map(g=>`<div class="wv-bar-row"><span>${esc(g.name)}</span><b>${g.count} aparelhos</b><strong>${money(g.cents)}</strong></div>`).join('')}</div></div><p>Contagem dos aparelhos disponíveis no armazém, incluindo Reserva e Emergência. Exclui enviados, utilizados e removidos.</p></section></div><section class="panel wv-notes"><b>Base de cálculo e pendências</b><p>Valores conforme as datas das fontes acima. Inclui chips ativos instalados e sem aparelho associado. Cobrança proporcional, créditos e ajustes não confirmados não são estimados.</p><p>${cost?`${cost.without_price} ativos sem tarifa · ${cost.conflicts} conflitos · ${cost.pending} consultas pendentes. ${cost.complete?'Fontes completas na última leitura.':'Subtotal: existem dados ou fontes pendentes.'}`:'Aguardando dados salvos.'}</p>${error?`<p role="alert">${esc(error)}</p>`:''}</section><details class="panel wv-details"><summary>Detalhar tarifas, faturas salvas e vínculos</summary><div class="wv-billing"></div></details>`;
 const details=root.querySelector('details');details.ontoggle=()=>{if(details.open&&!details.dataset.loaded){details.dataset.loaded='1';mountChipBilling(root.querySelector('.wv-billing'),{repo,icon});}};
 }
 return {update:draw,async refresh(){remote?.refresh();try{cost=await loadWarehouseCosts(repo,{reloadSaved:true});error='';}catch(e){error=e.message;}draw();}};
}
