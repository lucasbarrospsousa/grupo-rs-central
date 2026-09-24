const groups = {equipment:[['stock','Estoque','box'],['link','Vinculação','box'],['bulk','Cadastro em massa','file']],tracking:[['tracking','Consultar veículo','search'],['records','Histórico de posições','file'],['route','Trajeto','map']]};
export function mountSidebar({route,icon,navigate,logout,username}) {
 const sidebar=document.querySelector('.sidebar'); sidebar.className='sidebar central-sidebar';
 const activeGroup=Object.keys(groups).find(k=>groups[k].some(r=>r[0]===route));
 const link=([id,label,glyph])=>`<a href="#${id}" data-nav="${id}" ${id===route?'aria-current="page"':''}>${icon(glyph)}<span>${label}</span></a>`;
 const group=(id,label,glyph)=>`<button type="button" data-group="${id}" aria-controls="nav-${id}" aria-expanded="${id===activeGroup}" class="nav-group ${id===activeGroup?'contains-active':''}">${icon(glyph)}<span>${label}</span>${icon('down')}</button><div id="nav-${id}" class="nav-children" ${id===activeGroup?'':'hidden'}>${groups[id].map(link).join('')}</div>`;
 sidebar.innerHTML=`<div class="brand"><img src="logo.png" alt="Grupo RS"><div><small>GRUPO RS</small><b>CENTRAL</b></div></div><div class="nav-label">CENTRAL DE OPERAÇÕES</div><nav aria-label="Navegação principal">${link(['overview','Visão geral','home'])}${group('equipment','Equipamentos','box')}${link(['maintenance','Manutenções','tool'])}${group('tracking','Rastreamento','map')}${link(['warehouse','Armazém','fork'])}${link(['sms','Painel SMS','mail'])}${link(['settings','Configurações','settings'])}</nav><div class="bottom"><small></small><a href="#exit" id="exit">${icon('out')}<span>Sair</span></a></div>`;
 sidebar.querySelector('.bottom small').textContent=username?'Conectado • '+username:'Ambiente demonstrativo';
 sidebar.querySelectorAll('[data-nav]').forEach(a=>a.onclick=e=>{e.preventDefault();navigate(a.dataset.nav);});
 sidebar.querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>{const open=b.getAttribute('aria-expanded')!=='true';sidebar.querySelectorAll('[data-group]').forEach(other=>{const expanded=other===b&&open;other.setAttribute('aria-expanded',String(expanded));sidebar.querySelector('#nav-'+other.dataset.group).hidden=!expanded;});});
 sidebar.querySelector('#exit').onclick=e=>{e.preventDefault();logout();};
}
