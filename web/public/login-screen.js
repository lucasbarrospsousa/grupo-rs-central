import {initialReadPlan} from './startup-preload.js';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const symbols={building:'M4 21V3h12v18M2 21h20M8 7h1m3 0h1M8 11h1m3 0h1M8 15h1m3 0h1M8 21v-3h4v3m4-10h4v10',user:'M20 21v-2a7 7 0 0 0-14 0v2z M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',lock:'M6 10h12v11H6z M9 10V6a3 3 0 0 1 6 0v4',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z M14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0',arrow:'M4 12h16m-6-6 6 6-6 6',home:'M3 10l9-7 9 7M6 9v12h12V9m-9 12v-7h6v7',chart:'M5 20V10h3v10m4 0V5h3v15m4 0V2h3v18'};
const glyph=name=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+symbols[name]+'"/></svg>';
const credit=()=>'<div class="entry-credit"><span>DESENVOLVIDO POR</span><img src="sideracode.png" alt="SideraCode"></div>';
const skeleton=()=>'<div class="central-startup-skeleton" aria-hidden="true"><aside><img src="logo.png" alt="">'+['home','building','chart','lock'].map(x=>'<span>'+glyph(x)+'</span>').join('')+'</aside><div class="skeleton-main"><header><b>Visão geral</b><i></i></header><div class="skeleton-grid">'+Array.from({length:6},(_,i)=>'<section><div class="skeleton-title"></div>'+Array.from({length:i<3?2:5},()=>'<div class="skeleton-line"></div>').join('')+'</section>').join('')+'</div></div></div>';

export async function prepareLoginOverview(repo,preferred){
 const user=repo.user,destination=loginDestination(user,preferred);
 if(initialReadPlan(user,destination.branch).summary){
   await repo.loadGroup(destination.branch,'summary',{refresh:true});
   if(repo.user!==user||!repo.ready(destination.branch,'overview'))throw Error('Sessão alterada. Entre novamente.');
 }
 return destination;
}
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
 <p class="entry-eyebrow">CENTRAL DE OPERAÇÕES</p><h1 id="login-title">Bem-vindo à Central</h1><p class="central-login-subtitle">Gestão de equipamentos e operações</p>
 <div class="central-login-unit"><span>${glyph('pin')}<strong id="selected-unit">${esc(label())}</strong></span><button type="button" id="choose-unit">⇄ Trocar filial</button></div>
 <form id="real-login"><label for="login-username">Usuário</label><div class="entry-input">${glyph('user')}<input id="login-username" name="username" autocomplete="username" placeholder="Digite seu usuário" required></div>
 <label for="login-password">Senha</label><div class="central-password entry-input">${glyph('lock')}<input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" required><button type="button" id="reveal-password" aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
 <button class="central-login-submit" type="submit">Entrar na Central${glyph('arrow')}</button><p id="login-error" role="alert"></p></form>
 <p class="central-login-note">${glyph('lock')}${production?'Acesso conforme suas permissões.':'Homologação · ambiente de testes.'}</p>
 </section><dialog class="central-unit-dialog" aria-labelledby="unit-title"><header><div><h2 id="unit-title">Escolha sua filial</h2><p>Selecione a unidade para continuar</p></div><button type="button" aria-label="Fechar seleção">×</button></header><div class="central-unit-content"><p>Unidade selecionada: <strong id="dialog-unit">${esc(label())}</strong></p><div class="central-unit-options"></div><button type="button" class="central-login-submit central-unit-confirm">Continuar</button></div>${credit()}</dialog></main>`;
 const q=s=>root.querySelector(s),dialog=q('dialog');
 function drawOptions(){
  q('#dialog-unit').textContent=label();q('.central-unit-confirm').innerHTML='Continuar em '+esc(label())+glyph('arrow');
  q('.central-unit-options').innerHTML=branches.map(b=>`<button type="button" data-unit="${esc(b.id)}" aria-pressed="${b.id===selected}">${glyph('building')}<span class="unit-name"><strong>${esc(b.name)}</strong>${b.id===selected?'<small>Unidade selecionada</small>':''}</span><span aria-hidden="true">${b.id===selected?'✓':'›'}</span></button>`).join('');
  for(const button of dialog.querySelectorAll('[data-unit]'))button.onclick=()=>{selected=button.dataset.unit;q('#selected-unit').textContent=label();drawOptions();};
 }
 q('.central-unit-confirm').onclick=()=>{dialog.close();q('#choose-unit').focus();};
 q('#choose-unit').onclick=()=>{drawOptions();dialog.showModal();};
 dialog.querySelector('header button').onclick=()=>dialog.close();
 q('#reveal-password').onclick=()=>{const input=q('#login-password'),show=input.type==='password';input.type=show?'text':'password';q('#reveal-password').setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');q('#reveal-password').setAttribute('aria-pressed',String(show));};
 q('#real-login').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;q('#login-error').textContent='';
  const button=q('[type=submit]');button.disabled=true;button.textContent='Entrando…';q('#choose-unit').disabled=true;
  const f=new FormData(e.target);
  const overlay=document.createElement('div');overlay.className='central-startup';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
 overlay.innerHTML=skeleton()+'<section class="central-startup-card"><div class="central-startup-logo"><img src="logo.png" alt="Grupo RS"></div><h2>Preparando sua Central</h2><p class="central-startup-message">Validando seu acesso</p><ol><li class="current">Validando acesso</li><li>Carregando visão geral</li><li>Demais abas em segundo plano</li></ol><div class="entry-progress" aria-hidden="true"><i></i></div><small>Você entrará assim que o resumo estiver pronto.</small></section>';
 overlay.insertAdjacentHTML('beforeend',credit());root.append(overlay);
 const progress=branchName=>{overlay.querySelector('.central-startup-message').textContent='Carregando o resumo de '+branchName;const stages=overlay.querySelectorAll('li');stages[0].textContent='Acesso validado';stages[0].className='done';stages[1].className='current';};
 try{await submit(f.get('username'),f.get('password'),selected,progress);}
  catch(error){q('#login-error').textContent=error.message||'Não foi possível entrar. Tente novamente.';}
  finally{overlay.remove();busy=false;button.disabled=false;button.innerHTML='Entrar na Central'+glyph('arrow');const choose=q('#choose-unit');if(choose)choose.disabled=false;}
 };
}
