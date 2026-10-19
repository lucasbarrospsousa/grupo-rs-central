import {savedView} from './saved-view.js';
import {overviewData} from './warehouse-overview-model.js';
import {warehouseDay} from './warehouse-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100),num=n=>Number(n).toLocaleString('pt-BR');
const colors=['#1686ed','#009f91','#8a59ce','#ee8a12','#47758f'];
const paths={box:'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10',send:'M3 5h11v12H3z M14 9h4l3 4v4h-7 M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4',chip:'M7 3h10l4 4v14H7z M10 11h8v7h-8z M3 7v14',bolt:'M13 2L4 14h7l-1 8 10-13h-8z',cash:'M3 5h18v14H3z M12 8v8 M14 9h-3a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-3',chart:'M4 3v17h17 M8 16v-5 M13 16V7 M18 16V4',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',arrow:'M4 12h16 M14 6l6 6-6 6',plus:'M12 4v16 M4 12h16',search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6'};
const icon=name=>`<svg class="wo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.box}"/></svg>`;
import {cachedWarehouseCosts,loadWarehouseCosts} from './warehouse-cost-cache.js';
export {cachedWarehouseCosts} from './warehouse-cost-cache.js';
export function mountWarehouseOverview(root,{repo,navigate,newItem}){
 let rows=[],movements=[],month=warehouseDay(new Date()).slice(0,7),recentKind='device',busy=false,error='',loaded=false;
 const remote=repo.real?savedView(repo,repo.currentBranch,'warehouse',root,draw):null;
 const canCost=repo.real&&repo.user?.permissions?.owner;
 const cached=()=>cachedWarehouseCosts(repo);
 const metric=(title,value,sub,glyph,tone,action)=>`<button class="wo-kpi ${tone}" data-wo-action="${action}"><span class="wo-icon-tile">${icon(glyph)}</span><span><small>${title}</small><strong>${value}</strong><em>${sub}</em></span></button>`;
 async function costs(){if(busy||!canCost)return;busy=true;error='';draw();try{await loadWarehouseCosts(repo);}catch(e){error=e.message;}finally{busy=false;if(root.isConnected)draw();}}
 function draw(){if(!root.isConnected||root.hidden)return;const result=remote?.get({view:'overview',month});if(remote&&!result)return;const data=result?.data||overviewData(rows,movements,month),cost=cached();
 root.innerHTML=`<div class="wo-metrics">
 ${metric('Aparelhos disponíveis',num(data.available),'Prontos para distribuição','box','blue','devices')}
 ${metric('Enviados / identificados',num(data.sent),'Aparelhos no mês selecionado','send','teal','movements')}
 ${metric('Chips no armazém',num(data.chipTotal),data.chipCounts.map(c=>num(c.count)+' '+c.name.toLowerCase()).join(' · '),'chip','violet','chips')}
 ${metric('Ativações confirmadas',num(data.activated),num(data.pending)+' aguardando · mês selecionado','bolt','amber','reserve')}
 ${metric(cost?.complete?'Mensalidade estimada':'Mensalidade • subtotal',cost?money(cost.total_cents):'—',cost?num(cost.confirmed)+' chips ativos com valor':'Valores salvos de Árya e Link','cash','teal','costs')}
 </div><div class="wo-grid">
 <section class="wo-panel wo-shipments"><header><h2>${icon('chart')} Envios de aparelhos</h2><input type="month" id="wo-month" aria-label="Mês dos envios" value="${month}" max="${warehouseDay(new Date()).slice(0,7)}"></header><div class="wo-chart">${chart(data)}</div><div class="wo-destinations">${data.destinations.map((d,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${esc(d.name)} <b>${num(d.count)}</b></span>`).join('')||'<span>Nenhum envio neste mês.</span>'}</div><footer><small>Envio e identificação do mesmo item no destino contam uma vez.</small><button data-wo-action="analysis" class="wo-link">Meses anteriores ${icon('arrow')}</button></footer></section>
 <section class="wo-panel wo-chips"><header><h2>${icon('chip')} Chips e ativações</h2><button data-wo-action="chips" class="wo-link">Ver chips ${icon('arrow')}</button></header><div class="wo-chip-counts">${data.chipCounts.map((c,i)=>`<button data-wo-chip="${c.name}" class="${['teal','violet','amber'][i]}"><small>${c.name}</small><strong>${num(c.count)}</strong></button>`).join('')}</div><div class="wo-activation-summary"><span><i class="wo-dot teal"></i><b>${num(data.activated)}</b> confirmados no mês</span><span><i class="wo-dot amber"></i><b>${num(data.pending)}</b> aguardando</span></div><p class="wo-note">Acompanhe os lotes e as datas de ativação. Pendentes não são reenviados.</p><div class="wo-buttons"><button class="primary" data-wo-action="reserve">${icon('bolt')} Selecionar chips para ativar</button><button class="wo-link" data-wo-action="history">Acompanhar lotes ${icon('arrow')}</button></div></section>
 <section class="wo-panel wo-movements"><header><h2>${icon('clock')} Últimas movimentações</h2><div class="wo-segment"><button data-wo-kind="device" aria-pressed="${recentKind==='device'}">Aparelhos</button><button data-wo-kind="chip" aria-pressed="${recentKind==='chip'}">Chips</button></div></header><div class="wo-table-wrap"><table><thead><tr><th>Data</th><th>Movimento</th><th>Qtd.</th><th>Origem → destino</th></tr></thead><tbody>${data.batches.filter(b=>b.kind===recentKind).slice(0,4).map(b=>`<tr><td>${esc(new Date(b.atISO).toLocaleDateString('pt-BR'))}</td><td><span class="wo-tag ${b.detected?'violet':'blue'}">${b.detected?'Identificado':'Envio'}</span></td><td><b>${b.count}</b></td><td>Imperatriz ${icon('arrow')} <strong>${esc(b.destinationName)}</strong></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhuma movimentação no mês selecionado.</td></tr>'}</tbody></table></div><footer><small>Detecção não equivale à saída física.</small><button data-wo-action="movements" class="wo-link">Histórico completo ${icon('arrow')}</button></footer></section>
 ${costPanel(cost,canCost,busy,error)}
 </div>`;
 root.querySelector('#wo-month').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value)){month=e.target.value;draw();}};
 root.querySelectorAll('[data-wo-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.woAction;if(action==='costs'){root.querySelector('.wo-costs').scrollIntoView({block:'nearest'});return costs();}navigate(action);});
 root.querySelectorAll('[data-wo-chip]').forEach(b=>b.onclick=()=>navigate('chips',b.dataset.woChip));
 root.querySelectorAll('[data-wo-kind]').forEach(b=>b.onclick=()=>{recentKind=b.dataset.woKind;draw();});
 }
 return {update(nextRows,nextMovements){rows=nextRows;movements=nextMovements;if(root.hidden)return;draw();if(!loaded&&canCost){loaded=true;if(!cached())costs();}}};
}
function chart(data){const max=Math.max(1,...data.daily.map(d=>d.counts.reduce((a,b)=>a+b,0))),w=840,h=200,left=32,top=14,bottom=166,width=792,step=width/Math.max(1,data.daily.length),bar=Math.min(24,step*.62);let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Envios diários de aparelhos por destino"><title>Envios de aparelhos no mês</title>`;for(let i=0;i<=4;i++){const v=Math.ceil(max/4)*i,y=bottom-(bottom-top)*v/(Math.ceil(max/4)*4);svg+=`<line x1="${left}" x2="824" y1="${y}" y2="${y}" stroke="#e8eff6"/><text x="24" y="${y+4}" text-anchor="end">${v}</text>`;}
 const scale=(bottom-top)/(Math.ceil(max/4)*4);data.daily.forEach((d,i)=>{let sum=0;d.counts.forEach((count,j)=>{const height=count*scale;svg+=`<rect x="${left+i*step+(step-bar)/2}" y="${bottom-(sum+count)*scale}" width="${bar}" height="${height}" rx="2" fill="${colors[j%colors.length]}"><title>${esc(data.destinations[j].name)} • ${d.key}: ${count}</title></rect>`;sum+=count;});if(i===0||i===data.daily.length-1||i%Math.ceil(data.daily.length/9)===0)svg+=`<text x="${left+(i+.5)*step}" y="189" text-anchor="middle">${String(d.day).padStart(2,'0')}</text>`;});return svg+'</svg>';}

function costPanel(cost,canCost,busy,error){
 const providers=cost?.providers||[];
 const warnings=cost?[[cost.not_found,'não localizados'],[cost.pending,'a consultar'],[cost.without_price,'sem preço'],[cost.conflicts,'em dois provedores'],[cost.missing,'sem ICCID'],[cost.inactive,'não ativos'],[cost.duplicates,'vínculos repetidos']].filter(([n])=>n).map(([n,s])=>num(n)+' '+s).join(' · '):'';
 return `<section class="wo-panel wo-costs"><header><h2>${icon('cash')} Mensalidade dos chips</h2><span class="wo-tag teal">Todos os fornecedores</span></header>
 <div id="wo-cost-summary"><div class="wo-cost-head"><div class="wo-cost-total"><small>Tarifas atuais</small><strong>${cost?.checked_at?money(cost.total_cents):'—'}</strong></div><span class="wo-cost-coverage"><b>${num(cost?.confirmed||0)} / ${num(cost?.chip_count||0)}</b><small>chips ativos com valor</small></span></div>
 <div class="wo-cost-providers">${providers.map(p=>`<div><span><b>${esc(p.name)}</b><small>${num(p.confirmed)} chips · ${p.checked_at?esc(new Date(p.checked_at).toLocaleString('pt-BR')):'Ainda não consultado'}</small></span><strong>${p.checked_at?money(p.total_cents):'—'}</strong></div>`).join('')}</div>
 ${warnings?`<p class="wo-cost-pending">${esc(warnings)}</p>`:''}</div>
 ${providers.filter(p=>p.error||p.refreshing).map(p=>`<p class="wo-cost-pending" role="status">${esc(p.error||(p.name+': consulta em andamento.'))}</p>`).join('')}
 <footer><small>Faturas ${esc(cost?.billing?.month||'')}: ${Number.isInteger(cost?.billing?.total_cents)?money(cost.billing.total_cents):'Não informadas'}${cost?.billing?.complete?'':' · parcial'}</small><button data-wo-action="chips">${icon('chip')} Chips ${icon('arrow')}</button></footer>
 ${error||!canCost?`<p class="wo-cost-pending" role="status">${esc(error||'Valores disponíveis à administração.')}</p>`:''}

 <small class="wo-cost-disclaimer">Tarifas e faturas são valores distintos. Vínculos preservados.</small></section>`;
}
