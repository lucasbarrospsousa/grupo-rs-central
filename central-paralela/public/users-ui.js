'use strict';
const usersSeparator=document.createElement('p');usersSeparator.className='nav-section admin-separator';usersSeparator.id='admin-separator';usersSeparator.textContent='ADMINISTRAÇÃO';usersSeparator.hidden=true;
const usersButton=document.createElement('button');usersButton.id='nav-users';usersButton.className='nav-button';usersButton.setAttribute('data-tab','users');usersButton.hidden=true;usersButton.title='Usuários e permissões';usersButton.setAttribute('aria-label','Usuários e permissões');usersButton.innerHTML='<span class="icon-user-shield" aria-hidden="true"></span><span class="nav-label">Usuários e permissões</span>';
document.querySelector('.sidebar nav').append(usersSeparator,usersButton);

let usersRoot=document.getElementById('users-content');
if(!usersRoot){
  usersRoot=document.createElement('section');
  usersRoot.id='users-content';
  usersRoot.hidden=true;
  document.querySelector('#dashboard')?.append(usersRoot);
}

let usersDialog=document.getElementById('users-dialog');
if(!usersDialog){
  usersDialog=document.createElement('div');
  usersDialog.id='users-dialog';
  usersDialog.className='users-view-pane';
  usersRoot.append(usersDialog);
}
if(!usersDialog.showModal)usersDialog.showModal=()=>{if(usersRoot)usersRoot.hidden=false;};
if(!usersDialog.close)usersDialog.close=()=>{};

let usersGeneration=0;

const userEl=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
function resetUsers(){usersGeneration++;usersDialog.replaceChildren();usersButton.hidden=true;usersSeparator.hidden=true;if(usersRoot)usersRoot.hidden=true;}
function syncUsersAccess(){const show=!!session?.permissions?.owner;usersButton.hidden=!show;usersSeparator.hidden=!show;if(!session)resetUsers();}
new MutationObserver(syncUsersAccess).observe(dashboard,{attributes:true,attributeFilter:['hidden']});
syncUsersAccess();

window.showUsers=async function showUsers(){
  if(!session?.permissions?.owner)return;
  if(!await validateAccess())return;
  currentTab='users';
  content.hidden=true;
  $('#tracking-content').hidden=true;
  $('#maintenance-content').hidden=true;
  $('#warehouse-content').hidden=true;
  usersRoot.hidden=false;

  const hero=$('.operation-hero');
  hero.classList.remove('maintenance-hero','warehouse-hero');
  hero.classList.add('compact','users-hero');
  hero.querySelector('.eyebrow').textContent='CENTRAL DE OPERAÇÕES · ADMINISTRAÇÃO';
  hero.querySelector('.wh-preview-tag')?.remove();
  $('#hero-actions').hidden=true;
  $('#crumb').textContent='Usuários e permissões';
  $('#page-title').textContent='Usuários e permissões';
  $('#page-description').textContent='Controle de acessos, filiais autorizadas e rotinas no servidor.';
  status.textContent='';

  document.querySelectorAll('[data-tab]').forEach(b=>{
    if(b.dataset.tab==='users')b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });

  await renderUsers();
};

usersButton.addEventListener('click',async()=>{
  if(!session)return;
  showTab('users');
  if(matchMedia('(max-width: 680px)').matches&&!dashboard.classList.contains('sidebar-collapsed'))$('#toggle-sidebar').click();
  if(!await validateAccess())return;
});

async function renderUsers(){
  const epoch=++usersGeneration;usersDialog.replaceChildren(userEl('p','Carregando usuários…'));
  try{
    const data=await api('users',{action:'list'});if(epoch!==usersGeneration||!session)return;
    usersDialog.replaceChildren();

    const metrics=userEl('div');metrics.className='users-metrics';
    const totalUsers=data.users.length;
    const adminUsers=data.users.filter(u=>u.permissions?.owner).length;
    const activeUsers=data.users.filter(u=>u.active).length;

    for(const [label,count,tone] of [
      ['Total de operadores',totalUsers,'gold'],
      ['Administradores',adminUsers,'purple'],
      ['Contas ativas',activeUsers,'blue']
    ]){
      const card=userEl('article');card.className='card user-metric-card '+tone;
      const d=userEl('div',label);
      const st=userEl('strong',String(count));
      d.append(st);
      card.append(d);
      metrics.append(card);
    }
    usersDialog.append(metrics);

    const toolbar=userEl('div');toolbar.className='card users-toolbar';
    const toolbarDesc=userEl('div');toolbarDesc.className='users-toolbar-desc';
    const tTitle=userEl('h3','Gerenciamento de Acessos');
    const tSub=userEl('p','Cadastre novos operadores, defina filiais liberadas e configure rotinas automatizadas no servidor.');
    toolbarDesc.append(tTitle,tSub);
    const toolbarActions=userEl('div');toolbarActions.className='users-toolbar-actions';
    const jobs=userEl('button','Rotinas no servidor');
    jobs.onclick=()=>renderJobs().catch(e=>usersDialog.append(userEl('p',e.message)));
    const create=userEl('button','Novo usuário');
    create.className='primary';
    create.onclick=()=>editUserForm(null,data);
    toolbarActions.append(jobs,create);
    toolbar.append(toolbarDesc,toolbarActions);
    usersDialog.append(toolbar);

    const list=userEl('div');list.className='users-list';
    for(const u of data.users){
      const card=userEl('div');card.className='card user-card';
      const top=userEl('div');top.className='user-card-top';
      const avatar=userEl('div',u.username.slice(0,2).toUpperCase());
      avatar.className='user-avatar'+(u.permissions.owner?' is-admin':'');
      top.append(avatar);

      const info=userEl('div');info.className='user-info';
      const titleRow=userEl('div');titleRow.className='user-title-row';
      const strong=userEl('strong',u.username);
      const statusBadge=userEl('span',u.active?'Ativo':'Inativo');
      statusBadge.className='user-badge '+(u.active?'badge-active':'badge-inactive');
      titleRow.append(strong,statusBadge);
      if(u.permissions.owner){
        const ownerBadge=userEl('span','Administrador');
        ownerBadge.className='user-badge badge-owner';
        titleRow.append(ownerBadge);
      }
      info.append(titleRow);

      const branchP=userEl('p');branchP.className='user-branches-row';
      for(const b of u.branches){
        const bTag=userEl('span',b.name||b.id);bTag.className='user-branch-tag';
        branchP.append(bTag);
      }
      if(!u.branches.length){
        const emptyBranch=userEl('span','Nenhuma filial');emptyBranch.className='user-branch-tag';
        branchP.append(emptyBranch);
      }
      info.append(branchP);
      top.append(info);
      card.append(top);

      const footer=userEl('div');footer.className='user-card-footer';
      const edit=userEl('button',u.permissions.owner?'Administrador protegido':'Editar acesso');
      edit.disabled=!!u.permissions.owner;
      edit.onclick=()=>editUserForm(u,data);
      footer.append(edit);
      card.append(footer);

      list.append(card);
    }
    usersDialog.append(list);
  }catch(e){if(epoch===usersGeneration)usersDialog.replaceChildren(userEl('p',e.message));}
}

function editUserForm(user,data){
  usersDialog.replaceChildren();

  const navBar=userEl('div');navBar.className='card user-form-header';
  const back=userEl('button','Voltar');back.onclick=()=>renderUsers();
  const title=userEl('h2',user?'Editar usuário — '+user.username:'Novo usuário');
  navBar.append(back,title);
  usersDialog.append(navBar);

  const f=userEl('form');f.className='user-form-card card';
  const grid=userEl('div');grid.className='user-form-grid';f.append(grid);

  const field=(label,type,value='',placeholder='')=>{
    const l=userEl('label',label);
    const i=userEl('input');i.type=type;i.value=value;if(placeholder)i.placeholder=placeholder;
    l.append(i);grid.append(l);return i;
  };

  const username=field('Usuário','text',user?.username||'','Nome do usuário');
  username.required=true;username.disabled=!!user;

  const pw=field(user?'Nova senha (vazio mantém a atual)':'Senha','password','',user?'Manter senha atual':'Mínimo de 8 caracteres');
  pw.autocomplete='new-password';pw.required=!user;pw.minLength=8;pw.maxLength=128;

  const activeLabel=userEl('label');activeLabel.className='user-checkbox-label';activeLabel.style.gridColumn='1 / -1';
  const active=userEl('input');active.type='checkbox';active.checked=user?.active??true;
  activeLabel.append(active,document.createTextNode(' Usuário ativo e liberado para login'));
  grid.append(activeLabel);

  const branches=userEl('fieldset');branches.className='user-branches-fieldset';
  branches.append(userEl('legend','Filiais permitidas'));f.append(branches);
  const branchGrid=userEl('div');branchGrid.className='user-branches-grid';branches.append(branchGrid);
  const branchChecks=data.branches.map(b=>{
    const l=userEl('label',b.name||b.id);l.className='user-checkbox-label';
    const i=userEl('input');i.type='checkbox';i.value=b.id;i.checked=user?.branches.some(x=>x.id===b.id)||false;
    l.prepend(i);branchGrid.append(l);return i;
  });

  const tableWrap=userEl('div');tableWrap.className='user-table-wrap';
  const table=userEl('table');
  const tr=userEl('tr');for(const t of ['Módulo','Consultar','Alterar / executar'])tr.append(userEl('th',t));
  table.append(tr);tableWrap.append(table);f.append(tableWrap);

  const labels={overview:'Dashboard',stock:'Rastreamento',maintenance:'Manutenções',warehouse:'Armazém',sms:'SMS'};
  const checks=data.modules.map(m=>{
    const row=userEl('tr');row.append(userEl('td',labels[m]||m));
    const view=userEl('input'),write=userEl('input');
    view.type=write.type='checkbox';
    view.checked=user?.permissions.views.includes(m)||false;
    write.disabled=!(data.writable||[]).includes(m);
    write.checked=user?.permissions.writes?.includes(m)||false;
    view.onchange=()=>{if(!view.checked)write.checked=false;};
    write.onchange=()=>{if(write.checked)view.checked=true;};
    for(const input of [view,write]){const cell=userEl('td');cell.append(input);row.append(cell);}
    table.append(row);return {m,view,write};
  });

  const note=userEl('p','Alterações de acesso invalidam as sessões do usuário.');note.className='user-form-note';f.append(note);
  const buttons=userEl('div');buttons.className='tools users-toolbar-actions';
  const cancel=userEl('button','Voltar');cancel.type='button';cancel.onclick=renderUsers;
  const save=userEl('button','Salvar acesso');save.className='primary';
  buttons.append(cancel,save);f.append(buttons);

  f.onsubmit=async e=>{
    e.preventDefault();const epoch=usersGeneration;save.disabled=true;
    try{
      await api('users',{action:'save',id:user?.id,version:user?.version,username:username.value,password:pw.value,active:active.checked,branches:branchChecks.filter(i=>i.checked).map(i=>i.value),views:checks.filter(x=>x.view.checked).map(x=>x.m),writes:checks.filter(x=>x.write.checked).map(x=>x.m)});
      pw.value='';if(epoch===usersGeneration&&session)await renderUsers();
    }catch(err){note.textContent=err.message;save.disabled=false;}
  };

  usersDialog.append(f);
}

async function renderJobs(){
  usersDialog.replaceChildren();

  const navBar=userEl('div');navBar.className='card user-form-header';
  const back=userEl('button','Voltar');back.onclick=renderUsers;
  const title=userEl('h2','Rotinas no servidor');
  navBar.append(back,title);
  usersDialog.append(navBar);

  const intro=userEl('div');intro.className='card jobs-intro-card';
  const introText=userEl('p','As rotinas continuam em execução no servidor mesmo com o navegador fechado. Ative somente após desativar a rotina equivalente da Central antiga.');
  const branchSelectWrap=userEl('div');branchSelectWrap.className='jobs-branch-select';
  const branchLabel=userEl('label','Filial: ');branchLabel.style.fontWeight='700';branchLabel.style.color='#ffaa2b';
  const select=userEl('select');for(const b of session.branches)select.add(new Option(b.name||b.id,b.id));
  branchSelectWrap.append(branchLabel,select);
  intro.append(introText,branchSelectWrap);
  usersDialog.append(intro);

  const result=userEl('div');result.className='jobs-grid';usersDialog.append(result);

  const draw=async()=>{
    result.replaceChildren();
    for(const kind of ['status','global-status','codes','maintenance','warehouse','costs','warehouse-links']){
      if(['costs','warehouse-links'].includes(kind)&&select.value!=='imperatriz')continue;
      const j=await api('jobs',{action:'read',kind,branch:select.value});
      const box=userEl('section');box.className='card job-card';

      const info=userEl('div');info.className='job-info';
      const jobTitle=userEl('h3',({
        status:'Comunicação dos 50 selecionados',
        'global-status':'Comunicação do estoque e reserva',
        codes:'Conferência global de códigos',
        maintenance:'Comunicação em manutenção',
        warehouse:'Situação dos chips',
        costs:'Tarifas dos fornecedores',
        'warehouse-links':'Inventário de vínculos'
      })[kind]);
      info.append(jobTitle);

      const metaRow=userEl('div');metaRow.className='job-meta-row';
      const statusPill=userEl('span',j.enabled?'Ativa':'Pausada');
      statusPill.className='job-status-pill '+(j.enabled?'is-active':'is-paused');
      const lastRun=userEl('span',j.lastCompleted?'Última conclusão: '+formatDate(j.lastCompleted):'Ainda não executada');
      lastRun.className='job-last-run';
      metaRow.append(statusPill,lastRun);
      info.append(metaRow);

      const schedule={};
      if(kind==='codes'){
        const nightControls=userEl('div');nightControls.className='job-night-controls';
        for(const [key,type,value,label] of [
          ['nightly_enabled','checkbox',j.nightly_enabled,'Somente na janela noturna (Fortaleza)'],
          ['night_start','time',j.night_start||'22:00','Início'],
          ['night_end','time',j.night_end||'06:00','Fim'],
          ['interval_seconds','number',j.interval_seconds||25,'Intervalo entre aparelhos (segundos)']
        ]){
          const field=userEl('input'),caption=userEl('label',label+' ');
          field.type=type;
          if(type==='checkbox')field.checked=!!value;
          else field.value=value;
          if(type==='number'){field.min=25;field.max=3600;}
          field.disabled=!!j.enabled;
          schedule[key]=field;
          caption.append(field);
          nightControls.append(caption);
        }
        info.append(nightControls);
      }
      box.append(info);

      const actions=userEl('div');actions.className='job-actions';
      const toggle=userEl('button',j.enabled?'Pausar rotina':'Ativar rotina');
      toggle.className=j.enabled?'secondary':'primary';
      toggle.onclick=async()=>{
        const serials=monitorSelection().filter(r=>r.branch===select.value).map(r=>r.serial);
        if(!j.enabled&&!confirm('Ativar consultas reais no servidor? Confirme que a rotina equivalente da Central antiga está desativada.'))return;
        toggle.disabled=true;
        try{
          await api('jobs',{action:'configure',branch:select.value,kind,enabled:!j.enabled,confirmed:true,serials,...(kind==='codes'?{nightly_enabled:schedule.nightly_enabled.checked,night_start:schedule.night_start.value,night_end:schedule.night_end.value,interval_seconds:Number(schedule.interval_seconds.value)}:{})});
          if(kind==='status'&&!j.enabled){stopMonitor();autoMonitorStarted=true;}
          await draw();
        }catch(e){
          info.append(userEl('p',e.message));
          toggle.disabled=false;
        }
      };
      actions.append(toggle);
      box.append(actions);

      result.append(box);
    }
  };
  select.onchange=()=>draw().catch(e=>result.textContent=e.message);
  await draw();
}
