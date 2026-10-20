const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function loginDestination(user,preferred){
 const branch=user?.branches?.find(b=>b.id===preferred)||user?.branches?.find(b=>b.id==='imperatriz')||user?.branches?.[0];
 if(!branch)throw Error('Usuário sem filial autorizada.');
 return{branch:branch.id,route:'overview'};
}
export function mountLogin(root,{branches,submit,production=true}){
 let selected='imperatriz',busy=false;
 const label=()=>branches.find(b=>b.id===selected)?.name||'Selecione';
 root.innerHTML=`<main class="central-login"><section class="central-login-card" aria-labelledby="login-title">
 <div class="central-login-brand"><img src="logo.png" alt="Grupo RS"><div><strong>GRUPO RS</strong><span>CENTRAL</span></div></div>
 <h1 id="login-title">Acesse a Central</h1><p class="central-login-subtitle">Gestão de equipamentos e operações</p>
 <div class="central-login-unit"><span>Unidade selecionada: <strong id="selected-unit">${esc(label())}</strong></span><button type="button" id="choose-unit">⇄ Trocar filial</button></div>
 <form id="real-login"><label for="login-username">Usuário</label><input id="login-username" name="username" autocomplete="username" placeholder="Digite seu usuário" required>
 <label for="login-password">Senha</label><div class="central-password"><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required><button type="button" id="reveal-password" aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
 <button class="central-login-submit" type="submit">Entrar</button><p id="login-error" role="alert"></p></form>
 <p class="central-login-note">${production?'Acesso conforme suas permissões.':'Homologação · ambiente de testes.'}</p>
 </section><dialog class="central-unit-dialog" aria-labelledby="unit-title"><header><div><h2 id="unit-title">Escolha sua filial</h2><p>Selecione a unidade para continuar</p></div><button type="button" aria-label="Fechar seleção">×</button></header><div class="central-unit-content"><p>Unidade selecionada: <strong id="dialog-unit">${esc(label())}</strong></p><div class="central-unit-options"></div></div></dialog></main>`;
 const q=s=>root.querySelector(s),dialog=q('dialog');
 function drawOptions(){
  q('#dialog-unit').textContent=label();
  q('.central-unit-options').innerHTML=branches.map(b=>`<button type="button" data-unit="${esc(b.id)}" aria-pressed="${b.id===selected}"><span><strong>${esc(b.name)}</strong><small>UNIDADE · ${esc(b.name.toLocaleUpperCase('pt-BR'))}</small></span><span aria-hidden="true">${b.id===selected?'✓':'›'}</span></button>`).join('');
  for(const button of dialog.querySelectorAll('[data-unit]'))button.onclick=()=>{selected=button.dataset.unit;q('#selected-unit').textContent=label();dialog.close();q('#choose-unit').focus();};
 }
 q('#choose-unit').onclick=()=>{drawOptions();dialog.showModal();};
 dialog.querySelector('header button').onclick=()=>dialog.close();
 q('#reveal-password').onclick=()=>{const input=q('#login-password'),show=input.type==='password';input.type=show?'text':'password';q('#reveal-password').setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');q('#reveal-password').setAttribute('aria-pressed',String(show));};
 q('#real-login').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;q('#login-error').textContent='';
  const button=q('[type=submit]');button.disabled=true;button.textContent='Entrando…';q('#choose-unit').disabled=true;
  const f=new FormData(e.target);
  try{await submit(f.get('username'),f.get('password'),selected);}
  catch(error){q('#login-error').textContent=error.message||'Não foi possível entrar. Tente novamente.';}
  finally{busy=false;button.disabled=false;button.textContent='Entrar';const choose=q('#choose-unit');if(choose)choose.disabled=false;}
 };
}
