const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function openCodePending(ctx,{branchName,kind,rows,at}){
 const label={vehicle:'Placa',equipment:'Aparelho',owner:'Titular'}[kind];if(!label)return;
 const saved=(rows||[]).filter(r=>r.missing?.includes(kind));let page=0;
 ctx.showModal('Pendentes • '+label,`<section class="code-pending-list"><p>${esc(branchName)} · ${saved.length} aparelhos · leitura de ${esc(at?new Date(at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}):'horário não informado')}</p><input type="search" data-pending-search aria-label="Filtrar pendentes por série ou placa" placeholder="Filtrar série ou placa"><div class="code-pending-table"><table><thead><tr><th>Aparelho / série</th><th>Placa</th><th>Situação</th></tr></thead><tbody></tbody></table></div><footer><button data-pending-prev>Anterior</button><span role="status"></span><button data-pending-next>Próxima</button></footer><small>Dados salvos nesta leitura da Central. Nenhuma consulta à plataforma.</small></section>`,'medium');
 const host=document.querySelector('#modal .code-pending-list'),input=host.querySelector('input'),tbody=host.querySelector('tbody'),prev=host.querySelector('[data-pending-prev]'),next=host.querySelector('[data-pending-next]');
 function draw(){const q=input.value.replace(/[^a-z0-9]/gi,'').toUpperCase(),filtered=saved.filter(r=>[r.serial,r.plate].some(v=>String(v||'').replace(/[^a-z0-9]/gi,'').toUpperCase().includes(q))),pages=Math.max(1,Math.ceil(filtered.length/20));page=Math.min(page,pages-1);
  tbody.innerHTML=filtered.slice(page*20,page*20+20).map(r=>`<tr><td>${esc(r.serial)}</td><td>${esc(r.plate||'Não informada')}</td><td>${esc(r.status==='Manutenção'?'Reparo':r.status||'Não informada')}</td></tr>`).join('')||`<tr><td colspan="3">${rows?'Nenhum aparelho para este filtro.':'Detalhes indisponíveis nesta leitura. Atualize o painel.'}</td></tr>`;
  prev.disabled=page===0;next.disabled=page===pages-1;host.querySelector('[role=status]').textContent=`${filtered.length} aparelhos · página ${page+1} de ${pages}`;
 }
 input.oninput=()=>{page=0;draw();};prev.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};draw();
}
