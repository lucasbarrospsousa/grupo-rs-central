import {mountWarehouseMonthly} from './warehouse-monthly.js';
import {mountWarehouseActivation} from './warehouse-activation.js';
import {filterWarehouseMovements} from './warehouse-movements-model.js';
import {mountWarehouseOverview} from './warehouse-overview.js';
import {mountWarehouseChips} from './warehouse-chips.js';
import {warehouseBases,warehouseSummary,warehouseDestination,warehouseDay} from './warehouse-model.js';
export {warehouseSummary} from './warehouse-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let view='overview';
export function styleWarehouse({real=false,icon,newItem,refresh,repo,onUpdate,activeTab='device',chipActions}){
 document.querySelector('.content>.top').innerHTML='<div class="stock-app-heading"><strong>Armazém</strong></div>';
 const page=document.querySelector('#page'),stats=page.querySelector('.grid.four'),split=page.querySelector('.split'),inventory=split.querySelector('section'),transfer=split.querySelector('aside');
 stats.className='warehouse-metrics';stats.removeAttribute('style');
 stats.innerHTML=[['Aparelhos em estoque','phone','Disponíveis para distribuição'],['Chips em estoque','chip','Somente estoque disponível'],['Reserva','box','Itens separados'],['Emergência','alert','Fora do estoque disponível'],['Saídas hoje','fork','Itens identificados / enviados']].map(([title,glyph,sub],i)=>`<article class="warehouse-kpi tone-${i}">${icon(glyph)}<div><span>${title}</span><b class="value">0</b><small>${sub}</small></div></article>`).join('');
 const heading=document.createElement('div');heading.className='warehouse-heading';heading.innerHTML='<div><h1>Armazém central</h1><p>Centro de operações • Imperatriz • entrada manual de aparelhos e chips</p></div><div><button id="warehouse-refresh">Atualizar</button><button class="primary" id="warehouse-new">+ Cadastrar entrada</button></div>';page.prepend(heading);
 page.querySelector('#warehouse-new').onclick=newItem;page.querySelector('#warehouse-new').disabled=real&&(!repo.user?.branches?.some(b=>b.id==='imperatriz'&&b.role==='admin')||(!repo.user?.permissions?.owner&&!repo.user?.permissions?.writes?.includes('warehouse')));page.querySelector('#warehouse-refresh').onclick=refresh;
 const nav=document.createElement('div');nav.className='tabs warehouse-views';nav.innerHTML=[['overview','Visão geral'],['inventory','Aparelhos'],['chips','Chips'],['movements','Movimentações'],['analysis','Análise mensal']].map(([id,title])=>`<button data-warehouse-view="${id}">${title}</button>`).join('');stats.after(nav);
 const grid=document.createElement('div');grid.className='warehouse-control-grid';split.replaceWith(grid);
 inventory.classList.add('warehouse-inventory');transfer.classList.add('warehouse-transfer');
 inventory.querySelector('.toolbar').insertAdjacentHTML('beforeend',`<select id="warehouse-base" aria-label="Filtrar destino"><option value="">Todos os destinos</option>${warehouseBases.map(([id,title])=>`<option value="${id}">${title}</option>`).join('')}</select>`);
 const chart=document.createElement('section');
 const distribution=document.createElement('section');distribution.className='panel warehouse-distribution';distribution.innerHTML='<h2>Destinos das saídas</h2><p>Itens enviados / identificados no período selecionado</p><div id="warehouse-bases"></div>';
 const recent=document.createElement('section');recent.className='panel warehouse-recent';recent.innerHTML='<h2>Últimas movimentações</h2><p>Horário da detecção não equivale ao horário da saída física.</p><div id="warehouse-timeline"></div><button id="warehouse-history">Ver histórico completo →</button>';
 grid.append(chart,distribution,inventory,transfer,recent);
 transfer.querySelector('h2').innerHTML=icon('fork')+' Movimentar itens';transfer.querySelector('p').textContent='Origem: armazém central de Imperatriz';transfer.querySelector('.form-actions').prepend(page.querySelector('#warehouse-count'));
 const clear=document.createElement('button');clear.id='warehouse-clear-selection';clear.textContent='Limpar seleção';clear.type='button';transfer.querySelector('.form-actions').append(clear);
 const overview=document.createElement('section');overview.className='warehouse-overview';grid.before(overview);
 const chips=document.createElement('section');chips.className='warehouse-chips';inventory.append(chips);
 const chipControl=mountWarehouseChips(chips,{repo,icon,onUpdate,...chipActions});
 inventory.querySelector('#warehouse-classification').addEventListener('change',e=>{if(showingChips())chipControl.filter(e.target.value);});
 const showingChips=()=>view==='inventory'&&activeTab==='chip';
 const movementMonth=document.createElement('input');movementMonth.type='month';movementMonth.id='movement-month';movementMonth.setAttribute('aria-label','Mês das movimentações');movementMonth.value=warehouseDay(new Date()).slice(0,7);inventory.querySelector('.toolbar').append(movementMonth);
 const historyButton=document.createElement('button');historyButton.id='movement-all-history';historyButton.textContent='Histórico completo';inventory.querySelector('.toolbar').append(historyButton);
 movementMonth.onchange=()=>{page.querySelector('#warehouse-search').dispatchEvent(new Event('input'));};historyButton.onclick=()=>{movementMonth.value='';page.querySelector('#warehouse-status').value='all';page.querySelector('#warehouse-base').value='';page.querySelector('#warehouse-search').value='';movementMonth.onchange();};
 const filteredMovements=events=>filterWarehouseMovements(events,rows,{month:movementMonth.value,destination:page.querySelector('#warehouse-base').value,scope:page.querySelector('#warehouse-status').value,query:page.querySelector('#warehouse-search').value});
 const showingDevices=()=>view==='inventory'&&activeTab==='device';
 page.classList.toggle('warehouse-chips-page',showingChips());
 chips.hidden=!showingChips();
 if(showingChips()){inventory.querySelector('.toolbar').hidden=true;inventory.querySelector('#warehouse-table').hidden=true;page.querySelector('#warehouse-new').textContent='+ Cadastrar chip';page.querySelector('#warehouse-new').onclick=()=>{newItem();document.querySelector('#kind-chip')?.click();};}
 const overviewControl=mountWarehouseOverview(overview,{repo,newItem,navigate(action,classification){
  if(['devices','chips'].includes(action)){nav.querySelector('[data-warehouse-view="inventory"]').click();document.querySelector(`[data-tab="${action==='chips'?'chip':'device'}"]`).click();if(classification){const filter=document.querySelector('#warehouse-classification');filter.value=classification;filter.dispatchEvent(new Event('change'));}}
  else if(action==='history'||action==='reserve'){nav.querySelector('[data-warehouse-view="chips"]').click();document.querySelector('[data-ci-section="activation"]')?.click();if(action==='history'){const details=document.querySelector('.wc-activation details');if(details)details.open=true;}}
  else nav.querySelector(`[data-warehouse-view="${action}"]`)?.click();
 }});
 heading.querySelector('div:last-child').insertAdjacentHTML('beforeend',`<button id="warehouse-send">${icon('fork')} Enviar aparelhos</button>`);
 page.querySelector('#warehouse-send').onclick=()=>nav.querySelector('[data-warehouse-view="inventory"]').click();
 let rows=[],movements=[];
 function selectView(next){view=next;page.querySelector('#warehouse-new').hidden=['movements','analysis'].includes(view);page.classList.toggle('warehouse-analysis-page',view==='analysis');page.classList.toggle('warehouse-movements-page',view==='movements');movementMonth.hidden=historyButton.hidden=view!=='movements';if(view==='movements'){nav.after(stats);page.querySelector('#warehouse-status').innerHTML='<option value="shipments">Envios de aparelhos</option><option value="devices">Todas dos aparelhos</option><option value="chips">Movimentações de chips</option><option value="all">Todos os registros</option>';}if(showingDevices())nav.after(stats);page.classList.toggle('warehouse-devices-page',showingDevices());page.classList.toggle('warehouse-chips-page',showingChips());chips.hidden=!showingChips();page.querySelector('#warehouse-send').hidden=showingChips();page.querySelector('#warehouse-new').textContent=showingChips()?'+ Cadastrar chip':'+ Cadastrar entrada';page.querySelector('#warehouse-new').onclick=()=>{newItem();if(showingChips())document.querySelector('#kind-chip')?.click();};const isOverview=view==='overview';overview.hidden=!isOverview;stats.hidden=isOverview||view==='analysis';grid.hidden=isOverview;page.classList.toggle('warehouse-dashboard',isOverview);heading.querySelector('h1').textContent=isOverview?'Gestão do armazém':view==='analysis'?'Análise mensal':'Armazém central';heading.querySelector('p').textContent=isOverview?'Estoque, distribuição e controle de chips':view==='analysis'?'Envios de aparelhos, destinos e comparação mensal.':'Centro de operações • Imperatriz';grid.dataset.view=view;nav.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.warehouseView===(showingChips()?'chips':view)));chart.hidden=view!=='analysis';distribution.hidden=true;recent.hidden=true;inventory.hidden=!['inventory','movements'].includes(view);transfer.hidden=view!=='inventory';inventory.querySelector('.tabs').hidden=true;page.querySelector('#warehouse-month-totals').hidden=view!=='analysis';}
 nav.querySelectorAll('button').forEach(b=>b.onclick=()=>{const next=b.dataset.warehouseView;if(next==='chips'){selectView('inventory');page.querySelector('[data-tab="chip"]').click();return;}selectView(next);if(next==='movements')page.querySelector('[data-tab="movements"]').click();else if(next==='inventory')page.querySelector('[data-tab="device"]').click();});
 page.querySelector('#warehouse-history').onclick=()=>nav.querySelector('[data-warehouse-view="movements"]').click();
 chart.className='warehouse-monthly';
 const monthly=mountWarehouseMonthly(chart,{icon,openHistory(selectedMonth,destination){nav.querySelector('[data-warehouse-view="movements"]').click();document.querySelector('#movement-month').value=selectedMonth;document.querySelector('#warehouse-base').value=destination;document.querySelector('#movement-month').dispatchEvent(new Event('change'));}});
 function charts(){monthly.update(rows,movements);}
 selectView(view);
 return{filterMovements:filteredMovements,get base(){return page.querySelector('#warehouse-base').value;},update(nextRows,nextMovements){rows=nextRows;movements=nextMovements;overviewControl.update(rows,movements);if(showingChips()){chipControl.update(rows);stats.hidden=true;transfer.hidden=true;page.querySelector('#warehouse-send').hidden=true;heading.querySelector('h1').textContent='Gestão de chips';heading.querySelector('p').textContent='Estoque, mensalidades, vínculos e ativações.';}if(showingDevices()){
 heading.querySelector('h1').textContent='Gestão de aparelhos';heading.querySelector('p').textContent='Estoque, reserva, emergência e distribuição.';
 page.querySelector('#warehouse-new').textContent='+ Cadastrar aparelho';page.querySelector('#warehouse-new').onclick=()=>{newItem();document.querySelector('#kind-device')?.click();};
 page.querySelector('#warehouse-send').hidden=true;transfer.querySelector('h2').innerHTML=icon('fork')+' Enviar aparelhos';
 page.querySelector('#warehouse-search').placeholder='Buscar número de série';
 const devices=rows.filter(r=>r.kind==='device'&&r.status==='Disponível');
 stats.innerHTML=[['Estoque','box','Disponíveis para distribuição'],['Reserva','phone','Aparelhos separados'],['Emergência','alert','Reposição emergencial'],['','phone','No armazém']].map(([c,g,sub],i)=>`<button class="warehouse-device-card tone-${i}" data-device-category="${c}" aria-pressed="${page.querySelector('#warehouse-classification').value===c}">${icon(g)}<span><small>${c||'Total de aparelhos'}</small><b>${devices.filter(r=>!c||(r.classification||'Estoque')===c).length}</b><small>${sub}</small></span></button>`).join('');
 stats.querySelectorAll('[data-device-category]').forEach(b=>b.onclick=()=>{const filter=page.querySelector('#warehouse-classification');filter.value=b.dataset.deviceCategory;filter.dispatchEvent(new Event('change'));});
 }else if(view==='movements'){
 heading.querySelector('h1').textContent='Movimentações';heading.querySelector('p').textContent='Envios de aparelhos e histórico do armazém.';page.querySelector('#warehouse-new').hidden=true;page.querySelector('#warehouse-search').placeholder='Buscar série, destino ou observação';
 const destination=page.querySelector('#warehouse-base'),previous=destination.value;
 destination.innerHTML='<option value="">Todos os destinos</option>'+warehouseBases.map(([id,title])=>`<option value="${id}">${title}</option>`).join('')+[...new Set(movements.map(m=>m.destination).filter(d=>d&&!warehouseDestination(d)))].sort().map(d=>`<option value="custom:${esc(d)}">${esc(d)}</option>`).join('');destination.value=previous;
 const filtered=filteredMovements(movements),devices=new Map(rows.map(r=>[r.serial,r.kind]));
 const sent=filtered.filter(m=>(m.kind||devices.get(m.serial))==='device'&&['Envio','Enviado'].includes(m.type)&&!m.detected);
 stats.innerHTML=[['Envios de aparelhos',sent.length,'Registros no filtro','fork'],['Destinos',new Set(filtered.map(m=>m.destination).filter(Boolean)).size,'Destinos no filtro','location'],['Registros exibidos',filtered.length,'Resultado dos filtros','list'],['Histórico preservado',movements.length,'Todos os registros salvos','clock']].map(([title,value,sub,g],i)=>`<article class="warehouse-device-card tone-${i}">${icon(g)}<span><small>${title}</small><b>${value}</b><small>${sub}</small></span></article>`).join('');
 }else warehouseSummary(rows,movements).forEach((v,i)=>{const value=stats.querySelectorAll('.value')[i];if(value)value.textContent=v;});charts();}};
}
