// Move existing controls so their handlers and permission checks remain intact.
export function arrangeStockLayout(page){
 const card=page.querySelector('.stock-card'),find=s=>page.querySelector(s);
 const search=document.createElement('section');search.className='stock-search-panel';search.setAttribute('aria-label','Pesquisar equipamentos');
 search.innerHTML='<h2>Pesquisar equipamentos</h2><p>Busque em toda a filial e refine pela situação.</p>';
 const row=find('.stock-search-row'),input=find('.stock-search'),status=find('#stock-status');
 const label=document.createElement('label');label.className='stock-query-field';label.htmlFor='stock-query';label.append('Série, placa, associado, chip ou telefone',input);row.prepend(label);
 const statusLabel=document.createElement('label');statusLabel.className='stock-status-field';statusLabel.htmlFor='stock-status';status.before(statusLabel);statusLabel.append('Situação',status);
 search.append(row,find('#stock-owner-search'),find('#stock-period'));card.before(search);
 const title=document.createElement('div');title.className='stock-results-title';title.innerHTML='<h2>Equipamentos</h2>';title.append(find('#stock-status-filters'));
 const toolbar=find('.stock-filter-row'),actions=find('.stock-main-actions'),menu=find('.stock-more-menu');toolbar.prepend(title);
 menu.prepend(find('#stock-update-equipment'));const refresh=find('#stock-reconnect');refresh.innerHTML='↻ Atualizar status';refresh.title='Recarregar a lista e consultar os status desta página';
 actions.prepend(refresh,find('#stock-analyze'),find('#stock-report'));
 const bar=find('.stock-card-heading');bar.classList.add('stock-live-progress');bar.setAttribute('aria-live','polite');bar.querySelector('small').textContent='Aguardando os dados da página';
 const meter=document.createElement('progress');meter.id='stock-query-progress';meter.max=10;meter.value=0;meter.setAttribute('aria-label','Progresso das consultas desta página');
 const note=document.createElement('span');note.className='stock-round-note';note.textContent='Próxima rodada: 30 s após concluir';bar.append(meter,note);toolbar.after(bar);
 const links=document.createElement('details');links.className='stock-links-disclosure';links.innerHTML='<summary>Vinculações <span id="stock-link-summary">Verificando</span></summary>';links.append(find('#stock-link-controls'));bar.after(links);
 find('.stock-reading-note').hidden=true;
 for(const [i,text] of [[1,'Aparelho / comunicação'],[2,'Chip'],[4,'Veículo / associado'],[5,'Modelo']]){const th=find('.stock-table thead tr').children[i];(th.querySelector('button')||th).textContent=text;}
}
export function arrangeStockRowActions(body){
 for(const row of body.querySelectorAll('tr')){
  const actions=row.querySelector('.stock-row-actions');if(!actions)continue;
  const extras=[...actions.querySelectorAll('[data-auto-link],[data-delete],[data-discharge]')];if(!extras.length)continue;
  const trigger=document.createElement('button'),menu=document.createElement('div');trigger.type='button';trigger.textContent='⋯';trigger.title='Mais ações do aparelho';trigger.setAttribute('aria-label','Mais ações do aparelho');
  menu.id='stock-actions-'+row.querySelector('[data-detail]').dataset.detail;menu.className='stock-row-popover';menu.setAttribute('popover','auto');trigger.setAttribute('popovertarget',menu.id);
  for(const b of extras){if(b.hasAttribute('data-delete'))b.append(' Excluir');menu.append(b);}
  trigger.addEventListener('click',()=>{const r=trigger.getBoundingClientRect();menu.style.left=Math.max(12,Math.min(innerWidth-220,r.right-200))+'px';menu.style.top=Math.max(12,Math.min(innerHeight-170,r.bottom+6))+'px';});
  menu.addEventListener('click',e=>{if(e.target.closest('button'))menu.hidePopover();});actions.append(trigger,menu);
 }
}
