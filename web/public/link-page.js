export function normalizeLinkIdentification(value) {
 const compact=value.trim().toUpperCase().replace(/\s+/g,'');
 const match=/^(AAA|GRS|XRS)-?(\d{1,6})$/.exec(compact);
 if(!match) throw Error('Informe uma identificação AAA, GRS ou XRS seguida de 1 a 6 números.');
 return `${match[1]} - ${match[2]}`;
}
export function mountLinking({repo,branch,branchName,icon,showModal,notify}) {
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Dedicated synthetic fixtures; never write to the stock adapter or a remote API.
 const rows=repo?.real?repo.list(branch).filter(r=>['Manutenção','Reserva'].includes(r.status)):branch==='imperatriz'?Array.from({length:12},(_,i)=>({serial:`024800${String(i+1).padStart(3,'0')}`,model:i===0?'V7.2.2/7.1.6':'RS300',status:i<8?'Manutenção':'Reserva'})):[];
 let selected=rows[0]||null,filter='Todos',query='';
 document.querySelector('.content>.top').innerHTML=`<div class="stock-app-heading">${'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16M4 12h16M4 19h16"/></svg>'}<div><strong>Vinculação de aparelhos</strong><small>Início › Equipamentos › Vinculação de aparelhos</small></div></div>`;
 document.querySelector('#page').innerHTML=`<div class="link-eyebrow">GRUPO RS CENTRAL / ${esc(branchName.toUpperCase())}</div><div class="link-title"><h1>Vinculação para estoque</h1><button id="link-refresh">Atualizar lista</button></div><p class="link-intro">Selecione a série e informe a identificação para vincular ao cliente RS300.</p><div class="link-grid"><section class="link-panel"><h2>Aparelhos pendentes · ${rows.length}</h2><input id="link-search" aria-label="Buscar número de série" placeholder="Buscar número de série..."><div class="link-filters">${['Todos','Reserva','Manutenção'].map(s=>`<button data-link-filter="${s}" aria-pressed="${s==='Todos'}">${s}</button>`).join('')}</div><div class="link-columns"><span>Série / tipo</span><span>Situação atual</span></div><div id="link-list" class="link-list" aria-label="Aparelhos pendentes"></div><small>Reserva e Manutenção · role a lista para ver mais aparelhos</small></section><section class="link-panel link-editor"><header><h2>Preparar aparelho</h2><small>Identificação de teste · cliente RS300</small></header><div class="link-selected"><small>APARELHO SELECIONADO</small><div id="link-serial"></div><p id="link-status"></p></div><label for="link-identification">Placa / identificação</label><input id="link-identification" placeholder="Ex.: GRS - 021" maxlength="18" autocomplete="off"><p class="link-owner-label">Cliente titular</p><div class="link-owner">RS300</div><p class="link-target">Após confirmar o vínculo → Estoque</p><button class="primary" id="link-review">Revisar vinculação</button><small>O cadastro só passa para Estoque após a confirmação na plataforma.</small></section></div><div class="link-demo">PRÉVIA WEB · Dados demonstrativos · Banco e API não conectados</div>`;
 const draw=()=>{
 const visible=rows.filter(r=>(filter==='Todos'||r.status===filter)&&r.serial.includes(query.trim()));
 document.querySelector('#link-list').innerHTML=visible.map(r=>`<button class="link-row ${selected?.serial===r.serial?'selected':''}" data-link-serial="${r.serial}" aria-pressed="${selected?.serial===r.serial}"><span>${r.serial}<small>${esc(r.model)}</small></span><span class="link-state ${r.status==='Reserva'?'reserve':''}">${r.status}</span></button>`).join('')||`<p class="link-empty">${branch!=='imperatriz'?'Vinculação disponível inicialmente para Imperatriz.':'Nenhum aparelho encontrado com esse filtro.'}</p>`;
 document.querySelectorAll('[data-link-serial]').forEach(b=>b.onclick=()=>{selected=rows.find(r=>r.serial===b.dataset.linkSerial);draw();});
 document.querySelector('#link-serial').textContent=selected?.serial||'Selecione um aparelho';document.querySelector('#link-status').textContent=selected?.status||'Nenhum aparelho selecionado';document.querySelector('#link-review').disabled=!selected;
 document.querySelectorAll('[data-link-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.linkFilter===filter)));
 };
 document.querySelector('#link-search').oninput=e=>{query=e.target.value;draw();};
 document.querySelectorAll('[data-link-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.linkFilter;draw();});
 document.querySelector('#link-refresh').onclick=()=>{draw();notify('Lista demonstrativa atualizada. A API ainda não está conectada.');};
 document.querySelector('#link-review').onclick=()=>{try{
 const identification=normalizeLinkIdentification(document.querySelector('#link-identification').value);
 showModal('Revisar vinculação',`<div class="detail-list"><div>Série<b>${selected.serial}</b></div><div>Identificação<b>${esc(identification)}</b></div><div>Cliente titular<b>RS300</b></div><div>Situação prevista<b>${selected.status} → Estoque</b></div></div><div class="gate"><strong>Confirmação aguardando integração</strong><p>O servidor deverá conferir série, identificação e titular na plataforma antes de alterar o estoque. Nenhum vínculo foi enviado.</p></div><div class="form-actions"><button id="link-return">Voltar e editar</button><button disabled>Confirmar vínculo</button></div>`,'medium');
 document.querySelector('#link-return').onclick=()=>document.querySelector('#modal').close();
 }catch(e){notify(e.message);document.querySelector('#link-identification').focus();}};
 draw();
}
