const label=id=>({imperatriz:'Imperatriz',araguaina:'Araguaína',acailandia:'Açailândia',maraba:'Marabá'}[id]||id||'Origem não informada');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function warehouseSummary(rows,movements,now=new Date()){
 const available=rows.filter(r=>r.status==='Disponível'),stock=available.filter(r=>(r.classification||'Estoque')==='Estoque');
 const day=date=>new Date(date).toLocaleDateString('en-CA',{timeZone:'America/Fortaleza'});
 return [stock.filter(r=>r.kind==='device').length,stock.filter(r=>r.kind==='chip').length,available.filter(r=>r.classification==='Reserva').length,available.filter(r=>r.classification==='Emergência').length,movements.filter(m=>m.type==='Envio'&&m.atISO&&day(m.atISO)===day(now)).length];
}
export function styleWarehouse({real=false,icon,newItem,refresh,repo}){
 document.querySelector('.content>.top').innerHTML='<div class="stock-app-heading"><strong>Armazém</strong></div>';
 const page=document.querySelector('#page'),stats=page.querySelector('.grid.four'),split=page.querySelector('.split'),inventory=split.querySelector('section'),transfer=split.querySelector('aside');
 stats.style.marginBottom='';stats.className='warehouse-metrics';
 stats.innerHTML=[['Aparelhos em estoque','phone','Disponíveis para distribuição'],['Chips em estoque','chip','Somente estoque disponível'],['Reserva','box','Aparelhos e chips separados'],['Emergência','alert','Fora do estoque disponível'],['Saídas hoje','fork','Itens enviados no dia']].map(([title,glyph,sub],i)=>`<article class="warehouse-kpi tone-${i}">${icon(glyph)}<div><span>${title}</span><b class="value">0</b><small>${sub}</small></div></article>`).join('');
 const heading=document.createElement('div');heading.className='warehouse-heading';heading.innerHTML=`<div><h1>Central de controle do armazém</h1><p>Aparelhos, chips e movimentações das quatro bases</p></div><div><select id="warehouse-base" aria-label="Filtrar base do armazém"><option value="">Todas as bases</option>${(repo.user?.branches||[{id:'imperatriz'},{id:'araguaina'},{id:'acailandia'},{id:'maraba'}]).map(b=>`<option value="${esc(b.id)}">${esc(label(b.id))}</option>`).join('')}</select><button id="warehouse-refresh">Atualizar</button><button class="primary" id="warehouse-new">+ Novo item</button></div>`;page.prepend(heading);
 document.querySelector('#warehouse-new').onclick=newItem;document.querySelector('#warehouse-new').disabled=real&&(!repo.user?.branches?.some(b=>b.id===repo.currentBranch&&b.role==='admin')||(!repo.user?.permissions?.owner&&!repo.user?.permissions?.writes?.includes('warehouse')));document.querySelector('#warehouse-refresh').onclick=refresh;
 inventory.classList.add('warehouse-inventory');transfer.classList.add('warehouse-transfer');
 const grid=document.createElement('div');grid.className='warehouse-control-grid';split.replaceWith(grid);
 const distribution=document.createElement('section');distribution.className='panel warehouse-distribution';distribution.innerHTML='<h2>Distribuição por base</h2><p>Aparelhos e chips em estoque por origem</p><div id="warehouse-bases"></div>';
 const recent=document.createElement('section');recent.className='panel warehouse-recent';recent.innerHTML='<h2>Últimas movimentações</h2><p>Origem, destino e horário dos registros</p><div id="warehouse-timeline"></div><button id="warehouse-history">Ver histórico completo →</button>';
 grid.append(distribution,transfer,inventory,recent);
 transfer.querySelector('h2').innerHTML=icon('fork')+' Movimentar itens';transfer.querySelector('p').textContent='Origem dos itens: conforme seleção';transfer.querySelector('textarea').rows=1;
 transfer.querySelector('.form-actions').prepend(document.querySelector('#warehouse-count'));
 const clear=document.createElement('button');clear.id='warehouse-clear-selection';clear.textContent='Limpar seleção';clear.type='button';transfer.querySelector('.form-actions').append(clear);
 transfer.querySelector('p:last-child')?.remove();
 document.querySelector('#warehouse-history').onclick=()=>document.querySelector('[data-tab="movements"]').click();
 return {get base(){return document.querySelector('#warehouse-base').value;},update(rows,movements){
  const base=this.base,filtered=rows.filter(r=>!base||r.branch===base),events=movements.filter(m=>!base||m.branch===base);
  warehouseSummary(filtered,events).forEach((v,i)=>{stats.querySelectorAll('.value')[i].textContent=v;});
  document.querySelector('#warehouse-bases').innerHTML=(repo.user?.branches||[...new Set(rows.map(r=>r.branch))].map(id=>({id}))).map(b=>{const values=warehouseSummary(rows.filter(r=>r.branch===b.id),[]);return `<button class="warehouse-base-card ${base===b.id?'active':''}" data-base="${esc(b.id)}"><strong>${esc(label(b.id))}</strong><span><small>Aparelhos<b>${values[0]}</b></small><small>Chips<b>${values[1]}</b></small></span></button>`;}).join('');
  document.querySelectorAll('[data-base]').forEach(b=>b.onclick=()=>{const select=document.querySelector('#warehouse-base');select.value=select.value===b.dataset.base?'':b.dataset.base;select.dispatchEvent(new Event('change'));});
  document.querySelector('#warehouse-timeline').innerHTML=events.slice(0,3).map(m=>`<article><span class="timeline-dot"></span><div><strong>${esc(m.serial)}</strong><b>${esc(label(m.branch))} → ${esc(m.destination)}</b><small>${esc(m.at)}${m.detected?' • Detecção na Central':''}</small></div><span class="pill ${m.detected?'amber':'green'}">${esc(m.type)}</span></article>`).join('')||'<p class="empty">Nenhuma movimentação registrada.</p>';
 }};
}
