'use strict';
const stockSelected=new Set();let stockSort='',stockDirection=1,stockBusy=false,stockToken=0,stockBatchCancel=false;
let analysisState=null;
const stockDialog=document.querySelector('#stock-dialog');
const stockWritable=()=>session?.permissions?.owner===true||session?.permissions?.writes?.includes('stock');
const smsWritable=()=>session?.permissions?.owner===true||session?.permissions?.writes?.includes('sms');
const stockLabel=s=>s==='Manutenção'?'Reparo':s;
const stockVisible=r=>r.branch!=='imperatriz'&&r.status==='Reserva'?'Estoque':r.status;
const stockNormalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function stockOwner(r){const o=r.owner_binding;return r.status==='Instalado'&&o?.branch===r.branch&&o.serial===r.serial&&stockCompact(o.plate)===stockCompact(r.plate)?o.client:'';}
const stockCompact=v=>String(v||'').toUpperCase().replace(/[\s-]/g,'');
$('#stock-extension').innerHTML='<div class="stock-toolbar"><button id="stock-filters" aria-expanded="false">Filtros avançados</button><button id="stock-paste">Colar lista</button><button id="stock-new">Novo equipamento</button><button id="stock-analyze">Analisar baixa</button><button id="stock-update">Atualizar aparelhos</button><button id="stock-report">Relatório / PDF</button><button id="stock-operations">Vinculações e SMS</button><button id="stock-integrations">Integrações</button></div><div id="stock-advanced" class="stock-advanced" hidden><label>Ignição / comunicação<select id="stock-ignition"><option value="all">Todos</option><option value="on">Ligado</option><option value="off">Desligado</option><option value="stale">Desatualizado / sleep</option><option value="unknown">Sem comunicação</option></select></label><label>Cadastro / atualização — de<input id="stock-start" type="date"></label><label>Até<input id="stock-end" type="date"></label><button id="stock-period-clear">Limpar período</button></div><p id="stock-batch-summary" role="status" hidden></p><div id="stock-selection" class="stock-toolbar" hidden><strong id="stock-selected-count"></strong><button id="stock-unselect">Limpar seleção</button><button id="stock-link-selected">Vincular selecionados</button></div><p id="stock-feedback" role="status"></p>';
// Keep the existing controls and handlers; only group them into the approved panel.
const searchPanel=document.createElement('section');searchPanel.className='stock-search-panel';searchPanel.setAttribute('aria-label','Buscar aparelhos');
const baseFilters=document.querySelector('.tracking-filters');baseFilters.before(searchPanel);
searchPanel.innerHTML='<header class="stock-search-heading"><h2><span class="art art-search" aria-hidden="true"></span>Buscar aparelhos</h2><span>Busca individual ou em massa</span></header>';
searchPanel.append(baseFilters,$('#stock-extension'));
const toolbar=$('#stock-extension .stock-toolbar');toolbar.classList.add('stock-main-actions');
const secondary=document.createElement('details');secondary.id='stock-more';secondary.innerHTML='<summary>Mais ações <span aria-hidden="true">⌄</span></summary><div class="stock-more-menu"></div>';
for(const id of ['stock-analyze','stock-report','stock-operations','stock-integrations'])secondary.querySelector('div').append($('#'+id));
const actionLeft=document.createElement('div');actionLeft.className='stock-action-left';actionLeft.append($('#stock-filters'),$('#stock-paste'));
const actionRight=document.createElement('div');actionRight.className='stock-action-right';actionRight.append($('#stock-new'),$('#stock-update'),secondary);toolbar.replaceChildren(actionLeft,actionRight);
$('#stock-new').classList.add('stock-primary');
$('#stock-filters').setAttribute('aria-controls','stock-advanced');
for(const [id,icon] of [['stock-paste','paste'],['stock-update','refresh'],['stock-analyze','analysis'],['stock-report','report'],['stock-operations','sms'],['stock-integrations','integration']])$('#'+id).insertAdjacentHTML('afterbegin','<i class="loc-icon icon-'+icon+'" aria-hidden="true"></i>');
$('#stock-new').insertAdjacentHTML('afterbegin','<span class="stock-plus" aria-hidden="true">+</span>');
secondary.addEventListener('click',e=>{if(e.target.closest('button'))secondary.open=false;});
document.addEventListener('click',e=>{if(!secondary.contains(e.target))secondary.open=false;});
secondary.addEventListener('keydown',e=>{if(e.key==='Escape'){secondary.open=false;secondary.querySelector('summary').focus();}});
$('#device-search').placeholder='Buscar associado, placa, série, telefone, ICCID ou operadora';
function resetStockTools(){if(typeof closeLocationView==='function')closeLocationView();stockToken++;analysisState=null;stockBusy=false;stockBatchCancel=true;stockSelected.clear();stockDialog.close();$('#stock-dialog-body').replaceChildren();$('#stock-feedback').textContent='';}
function clearStockFilters(){for(const id of ['stock-start','stock-end'])$('#'+id).value='';$('#stock-ignition').value='all';stockSort='';}
function stockFilter(all){
 const scoped=all.filter(r=>branch.value==='all'||r.branch===branch.value),q=$('#device-search').value.trim(),batch=/[;\r\n]/.test(q),tokens=[...new Set(q.split(/[;\r\n]+/).map(x=>x.trim()).filter(Boolean))];
 const match=(r,t)=>r.serial===t||[r.plate,r.identification].some(x=>stockCompact(x)===stockCompact(t));
 const matched=scoped.filter(r=>batch?tokens.some(t=>match(r,t)):[r.serial,r.plate,r.identification,r.phone,r.iccid,r.carrier,stockOwner(r)].some(v=>stockNormalize(v).includes(stockNormalize(q))));
 const start=$('#stock-start').value,end=$('#stock-end').value,ignition=$('#stock-ignition').value,selectedStatus=$('#device-status').value,carrier=$('#device-carrier').value;
 const summary=$('#stock-batch-summary');summary.hidden=!batch;summary.textContent=tokens.length+' pesquisados · '+matched.length+' encontrados · não encontrados: '+(tokens.filter(t=>!scoped.some(r=>match(r,t))).join('; ')||'nenhum');
 const list=matched.filter(r=>{const state=communicationStatus(r.live?.location).state,date=String(r.updated_at||r.created_at||'').slice(0,10);return(!selectedStatus||stockVisible(r)===selectedStatus)&&(!carrier||r.carrier===carrier)&&(ignition==='all'||(state==='sleep'?'stale':state)===ignition)&&(!(start||end)||(date&&(!start||date>=start)&&(!end||date<=end)));});
 if(start&&end&&start>end){$('#stock-feedback').textContent='A data final não pode ser anterior à inicial.';return [];}
 if(stockSort)list.sort((a,b)=>String(a[stockSort]||'').localeCompare(String(b[stockSort]||''),'pt-BR',{numeric:true})*stockDirection);
 const select=$('#device-status'),value=select.value;select.replaceChildren(...['','Estoque','Reserva','Instalado','Manutenção','Inativos'].map(x=>new Option((x?stockLabel(x):'Todos')+' ('+(x?scoped.filter(r=>stockVisible(r)===x).length:scoped.length)+')',x)));select.value=value;
 return list;
}
function stockActions(d){return '<details class="row-menu"><summary aria-label="Mais ações de '+esc(d.serial)+'">•••</summary><div><button data-stock-action="location" data-id="'+esc(d.id)+'">Localização</button>'+(stockWritable()?[['edit','Editar'],...(d.status==='Estoque'?[['install','Dar baixa']]:[]),['link','Vincular'],['delete','Excluir']].map(([a,l])=>'<button data-stock-action="'+a+'" data-id="'+esc(d.id)+'">'+l+'</button>').join(''):'')+(smsWritable()?'<button data-stock-action="sms" data-id="'+esc(d.id)+'">SMS</button>':'')+'</div></details>';}
function syncStockTools(){
 for(const id of ['stock-new','stock-analyze','stock-update','stock-link-selected'])$('#'+id).hidden=!stockWritable();
 const visible=filtered.slice((page-1)*50,page*50),box=$('#select-page');box.checked=!!visible.length&&visible.every(d=>stockSelected.has(d.id));box.indeterminate=visible.some(d=>stockSelected.has(d.id))&&!box.checked;
 $('#stock-selection').hidden=!stockSelected.size;$('#stock-selected-count').textContent=stockSelected.size+' selecionados';
}
function modal(title,html){$('#stock-dialog-title').textContent=title;$('#stock-dialog-body').innerHTML=html;$('#stock-dialog-message').textContent='';if(!stockDialog.open)stockDialog.showModal();}
function stockError(e){$('#stock-dialog-message').textContent=e.message;$('#stock-feedback').textContent=e.message;}
function scopedBranch(){if(branch.value==='all')throw Error('Selecione uma filial para esta ação.');return branch.value;}
async function inv(action,row,extra={}){
 if(!await validateAccess())throw Error('Sessão expirada.');
 const token=stockToken,payload={action,branch:row?.branch||scopedBranch(),id:row?.id,version:row?.version||1,key:crypto.randomUUID(),...extra};let result;
 try{result=await api('inventory',payload);}catch(e){if(e.status!==429)throw e;$('#stock-feedback').textContent='Aguardando intervalo seguro entre operações…';await new Promise(r=>setTimeout(r,10000));if(token!==stockToken||!session)throw Error('Sessão encerrada.');result=await api('inventory',payload);}
 if(token!==stockToken||!session)throw Error('Sessão encerrada.');
 if(Array.isArray(result.rows)){const b=row?.branch;for(const updated of result.rows){const current=devices.find(d=>d.id===updated.id&&d.branch===b);if(current)Object.assign(current,updated);const saved=cache.tracking?.find(s=>s.branch.id===b)?.rows.find(d=>d.id===updated.id);if(saved)Object.assign(saved,updated);}result.row=result.rows.find(d=>d.id===row?.id)||row;}
 if(Object.hasOwn(result,'row')&&action!=='lookup'){
  const id=row?.id||result.row?.id,b=row?.branch||branch.value,source=cache.tracking?.find(s=>s.branch.id===b);if(source){source.rows=source.rows.filter(r=>r.id!==id);if(result.row)source.rows.push(result.row);}
  devices=devices.filter(r=>!(r.id===id&&r.branch===b));if(result.row)devices.push({...result.row,branch:b,branchName:session.branches.find(x=>x.id===b)?.name});
  if(!result.row)stockSelected.delete(id);
  if(cache.dashboard&&session.permissions.views.includes('overview')){const summary=cache.dashboard.find(x=>x.branch.id===b);if(summary){const rows=devices.filter(d=>d.branch===b),group=k=>Object.entries(rows.reduce((m,r)=>(m[r[k]||'Não informado']=(m[r[k]||'Não informado']||0)+1,m),{})).map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);Object.assign(summary,{total:rows.length,statuses:group('status'),carriers:group('carrier'),models:group('model')});render(scopedSnapshots('dashboard'));}}
  renderTracking();
 }
 return result;
}
async function safe(action){try{await action();}catch(e){stockError(e);}}
$('#stock-dialog-close').onclick=()=>stockDialog.close();
$('#stock-filters').onclick=()=>{const p=$('#stock-advanced');p.hidden=!p.hidden;$('#stock-filters').setAttribute('aria-expanded',String(!p.hidden));};
for(const id of ['stock-ignition','stock-start','stock-end'])$('#'+id).onchange=()=>safe(async()=>{if(await validateAccess()){page=1;renderTracking();}});
$('#stock-period-clear').onclick=()=>{clearStockFilters();renderTracking();};
$('#device-search').addEventListener('paste',e=>{const text=e.clipboardData.getData('text');if(/[\r\n]/.test(text)){e.preventDefault();e.target.value=text.replace(/[\r\n]+/g,';');e.target.dispatchEvent(new Event('input'));}});
$('#stock-paste').onclick=()=>{modal('Buscar lista','<p>Busca exata por séries, placas ou identificações. Separe por linha ou ;.</p><textarea id="paste-list" rows="8" aria-label="Lista de aparelhos"></textarea><button id="paste-apply" class="primary">Buscar lista</button>');$('#paste-apply').onclick=()=>{$('#device-search').value=$('#paste-list').value.replace(/[\r\n]+/g,';')+';';page=1;renderTracking();stockDialog.close();};};
$('#select-page').onchange=e=>{filtered.slice((page-1)*50,page*50).forEach(r=>e.target.checked?stockSelected.add(r.id):stockSelected.delete(r.id));renderTracking();};
$('#stock-unselect').onclick=()=>{stockSelected.clear();renderTracking();};
$('#device-rows').addEventListener('change',e=>{if(e.target.matches('[data-select]')){e.target.checked?stockSelected.add(e.target.dataset.select):stockSelected.delete(e.target.dataset.select);syncStockTools();}});
for(const b of document.querySelectorAll('[data-sort]'))b.onclick=()=>{stockDirection=stockSort===b.dataset.sort?-stockDirection:1;stockSort=b.dataset.sort;page=1;renderTracking();};
function equipmentForm(row){
 if(!stockWritable())return;const labels={serial:'Série',identification:'Identificação',plate:'Placa',model:'Modelo / versão',carrier:'Operadora',iccid:'ICCID',phone:'Telefone',apn:'APN'};
 modal(row?'Editar equipamento':'Novo equipamento','<form id="equipment-form"><div class="stock-form-grid">'+Object.entries(labels).map(([key,label])=>'<label>'+label+'<input name="'+key+'" value="'+esc(row?.[key]||'')+'" maxlength="120" '+(key==='serial'?'required pattern="[0-9]{9}" '+(row?'readonly':''):'')+'></label>').join('')+'<label>Situação<select name="status">'+['Estoque','Reserva','Manutenção','Inativos',...(row?.status==='Instalado'?['Instalado']:[])].map(x=>'<option '+(x===row?.status?'selected':'')+'>'+x+'</option>').join('')+'</select></label></div><div class="stock-toolbar"><button type="button" id="equipment-lookup">Buscar dados pela série</button><button class="primary">Salvar cadastro</button></div><p>Cadastro salvo somente nesta Central paralela.</p></form>');
 const form=$('#equipment-form'),key=crypto.randomUUID();form.elements.identification.oninput=()=>{const prefix=form.elements.identification.value.trim().slice(0,3).toUpperCase(),version={GRS:'V7.3.2',AAA:'V7.2.2/7.1.6',XRS:'V7.3.5'}[prefix];if(version)form.elements.model.value=version;};$('#equipment-lookup').onclick=()=>safe(async()=>{stopMonitor();const result=await inv('lookup',row,{serial:form.elements.serial.value});for(const [k,v]of Object.entries(result.row))if(form.elements[k]&&v)form.elements[k].value=v;});
 form.onsubmit=e=>{e.preventDefault();const button=form.querySelector('[type=submit]')||form.querySelector('.primary');button.disabled=true;safe(async()=>{await inv(row?'edit':'create',row,{key,values:Object.fromEntries(new FormData(form))});stockDialog.close();$('#stock-feedback').textContent='Cadastro salvo.';}).finally(()=>button.disabled=false);};
}
$('#stock-new').onclick=()=>safe(()=>{scopedBranch();equipmentForm();});
function confirmAction(action,row){
 if(action==='install'){const activeBranch=scopedBranch();if(row.branch!==activeBranch||row.status!=='Estoque')throw Error('A baixa só é permitida para aparelhos em Estoque da filial selecionada.');}
 modal(action==='delete'?'Excluir equipamento':'Dar baixa', '<p>Aparelho <strong>'+esc(row.serial)+'</strong>. '+(action==='delete'?'A remoção preserva a auditoria no Drive.':'A baixa registra a instalação apenas nesta Central (somente aparelhos em Estoque da filial selecionada).')+'</p>'+(action==='install'?'<label>Placa do veículo<input id="install-plate" maxlength="10" value="'+esc(row.plate||'')+'"></label>':'')+'<button id="confirm-stock" class="primary">Confirmar '+(action==='delete'?'exclusão':'baixa')+'</button>');
 const key=crypto.randomUUID();$('#confirm-stock').onclick=e=>{e.target.disabled=true;safe(async()=>{if(action==='install'){const activeBranch=scopedBranch(),live=devices.find(d=>d.id===row.id&&d.branch===activeBranch);if(!live||live.branch!==activeBranch||live.status!=='Estoque')throw Error('A baixa só é permitida para aparelhos em Estoque da filial selecionada.');}await inv(action,row,{key,confirmed:true,plate:$('#install-plate')?.value});stockDialog.close();$('#stock-feedback').textContent='Operação registrada.';}).finally(()=>e.target.disabled=false);};
}

async function linkOne(row){stopMonitor();const r=await inv('link-preview',row),op=r.operation;
 modal('Vincular · '+row.serial,'<p>Identificação: <strong>'+esc(op.plate)+'</strong></p><p>'+esc(op.message)+'</p>'+(op.state==='prepared'?'<button id="link-confirm" class="primary">Confirmar vínculo na plataforma</button>':'<button id="link-confirm">Conferir vínculo sem reenviar</button>'));
 const key=crypto.randomUUID();$('#link-confirm').onclick=e=>{e.target.disabled=true;safe(async()=>{const result=await inv(op.state==='prepared'?'link-confirm':'link-check',row,{key,operation:op.id,confirmed:true});$('#stock-dialog-message').textContent=result.operations?.find(x=>x.id===op.id)?.message||'Conferido.';}).finally(()=>e.target.disabled=false);};
}
async function smsForm(row){
 const health=await inv('integrations',row),enabled=health.sms.send_enabled;
 modal('SMS · conexão independente','<p>Aparelho '+esc(row.serial)+' · Telefone '+esc(row.phone||'não informado')+'</p><p>'+esc(health.sms.message)+'</p><div class="stock-toolbar"><button id="sms-standard">Configuração padrão</button><button id="sms-reset">Reiniciar</button><button id="sms-clear">Limpar memória</button></div><label>Mensagem / comando<textarea id="sms-command" rows="4" maxlength="160"></textarea></label><button id="sms-save">Salvar rascunho</button><button id="sms-send" '+(enabled?'':'disabled')+'>Enviar SMS</button>');$('#sms-standard').onclick=()=>safe(async()=>{const template=await inv('sms-template',row);$('#sms-command').value=template.command;});$('#sms-reset').onclick=()=>$('#sms-command').value='reset,123456';$('#sms-clear').onclick=()=>$('#sms-command').value='locache,123456,1';const key=crypto.randomUUID();$('#sms-save').onclick=e=>{e.target.disabled=true;safe(async()=>{await inv('sms-draft',row,{key,command:$('#sms-command').value});$('#stock-dialog-message').textContent='Rascunho salvo; nenhum SMS enviado.';}).finally(()=>e.target.disabled=false);};$('#sms-send').onclick=e=>{e.target.disabled=true;safe(async()=>{await inv('sms-send',row,{key:crypto.randomUUID(),command:$('#sms-command').value,phone:row.phone,confirmed:true});$('#stock-dialog-message').textContent='Adicionado à fila própria. Confira em Vinculações e SMS.';}).finally(()=>e.target.disabled=!enabled);};
}
$('#device-rows').addEventListener('click',e=>{const b=e.target.closest('[data-stock-action],[data-open-location]');if(!b)return;const row=devices.find(d=>d.id===(b.dataset.id||b.dataset.openLocation));if(!row)return;safe(async()=>{if(!await validateAccess())return;const action=b.dataset.stockAction||'location';if(action==='location')return locationView(row);if(action==='sms'&&smsWritable())return smsForm(row);if(!stockWritable())throw Error('Usuário somente de leitura.');if(action==='edit')equipmentForm(row);else if(action==='link')await linkOne(row);else confirmAction(action,row);});});
$('#device-rows').addEventListener('keydown',e=>{if(e.target.matches('[data-open-location]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.click();}});
function selectedRows(){const list=stockSelected.size?devices.filter(r=>stockSelected.has(r.id)&&(branch.value==='all'||r.branch===branch.value)):filtered.slice((page-1)*50,page*50);if(list.length>50)throw Error('Selecione até 50 aparelhos por lote.');return list;}
async function batchRead(action){if(stockBusy)return;scopedBranch();stopMonitor();const list=selectedRows(),token=stockToken;stockBusy=true;const results=[];try{for(const r of list){if(token!==stockToken||!session)break;$('#stock-feedback').textContent='Conferindo '+(results.length+1)+' de '+list.length;if(action==='analyze'&&$('#analysis-progress'))$('#analysis-progress').textContent=$('#stock-feedback').textContent;try{const v=await inv(action,r);results.push({row:r,...v});}catch(e){results.push({row:r,error:e.message});}if(results.length<list.length)await new Promise(resolve=>setTimeout(resolve,10000));}return results;}finally{stockBusy=false;}}
$('#stock-update').onclick=()=>safe(async()=>{const result=await batchRead('refresh-equipment');if(result)$('#stock-feedback').textContent=result.filter(r=>!r.error).length+' atualizados · '+result.filter(r=>r.error).length+' pendentes.';});
function stockAnalysisRows(chosen){
 if(!chosen||chosen==='all')throw Error('Selecione uma filial para analisar a baixa.');
 const base=stockSelected.size?devices.filter(r=>stockSelected.has(r.id)):filtered.slice((page-1)*50,page*50);
 const list=base.filter(r=>r.branch===chosen&&r.status==='Estoque');
 if(list.length>50)throw Error('Selecione até 50 aparelhos em Estoque por lote.');
 return {list,ignored:base.length-list.length};
}
function drawAnalysis(){
 const st=analysisState;if(!$('#analysis-results'))return;
 const chosen=$('#analysis-branch')?.value||st?.branch||(branch.value!=='all'?branch.value:session.branches[0]?.id||'');
 if(!st){
  let count=0,ignored=0;try{const c=stockAnalysisRows(chosen);count=c.list.length;ignored=c.ignored;}catch{}
  $('#analysis-progress').textContent=count+' aparelho(s) em Estoque nesta filial prontos para consulta'+(ignored?' · '+ignored+' fora de Estoque/filial ignorado(s)':'');
  if($('#analysis-pct'))$('#analysis-pct').textContent='0%';
  $('#analysis-meter').value=0;$('#analysis-meter').max=1;
  if($('#analysis-kpis'))$('#analysis-kpis').innerHTML='<div class="analysis-kpi"><span>Em Estoque na seleção</span><strong>'+count+'</strong></div><div class="analysis-kpi amber"><span>Prontos para revisão</span><strong>0</strong></div><div class="analysis-kpi green"><span>Baixas registradas</span><strong>0</strong></div><div class="analysis-kpi slate"><span>Aguardando vínculo</span><strong>0</strong></div>';
  $('#analysis-start').disabled=stockBusy;$('#analysis-branch').disabled=false;$('#analysis-stop').disabled=true;
  $('#analysis-results').innerHTML='';return;
 }
 const total=Math.max(1,st.rows.length),pct=Math.round((st.results.length/total)*100);
 const readyCount=st.results.filter(x=>x.result?.ok&&!x.done).length,doneCount=st.results.filter(x=>x.done).length,waitCount=st.results.filter(x=>!x.done&&!x.result?.ok).length;
 $('#analysis-progress').textContent=st.results.length+' de '+st.rows.length+' conferidos'+(st.running?' · Análise em andamento':st.cancel?' · Pausada':' · Concluída')+(st.ignored?' · '+st.ignored+' fora de Estoque/filial ignorado(s)':'');
 if($('#analysis-pct'))$('#analysis-pct').textContent=pct+'%';
 $('#analysis-meter').value=st.results.length;$('#analysis-meter').max=total;
 if($('#analysis-kpis'))$('#analysis-kpis').innerHTML='<div class="analysis-kpi"><span>Conferidos em Estoque</span><strong>'+st.results.length+' / '+st.rows.length+'</strong></div><div class="analysis-kpi amber"><span>Prontos para revisão</span><strong>'+readyCount+'</strong></div><div class="analysis-kpi green"><span>Baixas registradas</span><strong>'+doneCount+'</strong></div><div class="analysis-kpi slate"><span>Aguardando vínculo</span><strong>'+waitCount+'</strong></div>';
 $('#analysis-start').disabled=stockBusy;$('#analysis-branch').disabled=st.running;$('#analysis-stop').disabled=!st.running;
 $('#analysis-results').innerHTML=st.results.map((x,i)=>{const client=x.result?.client||x.result?.nomeCliente||x.result?.nomeAssociado||x.row?.owner_binding?.client||'';const plateBox=(label,plate)=>'<div class="analysis-plate-box"><span>'+label+'</span><strong>'+esc(plate)+'</strong>'+(client?'<span class="analysis-plate-client" title="'+esc(client)+'">'+esc(client)+'</span>':'')+'</div>';return '<article class="analysis-item '+(x.done?'is-done':x.result?.ok?'is-ready':'')+'"><div><strong class="analysis-serial">'+esc(x.row.serial)+'</strong><small>'+esc(x.row.identification||'Sem identificação')+(x.row.model?' · '+esc(x.row.model):'')+'</small></div><div class="analysis-mid"><span class="analysis-status '+(x.done?'done':x.result?.ok?'ready':'')+'">'+(x.done?'Baixa registrada':x.result?.ok?'Pronto para revisão':'Conferir')+'</span><p>'+esc(x.error||x.result?.message||'Sem confirmação')+'</p></div><div class="analysis-action">'+(x.done&&x.result?.plate?plateBox('Instalado em',x.result.plate):x.result?.ok&&!x.done?plateBox('Placa confirmada',x.result.plate||'—')+(x.review?'<div class="analysis-review-confirm"><span>Confirmar instalação?</span><button data-analysis-review="'+i+'" '+(x.saving?'disabled':'')+'>Cancelar</button><button class="primary" data-analysis-save="'+i+'" '+(x.saving?'disabled':'')+'>'+(x.saving?'Salvando…':'Confirmar baixa')+'</button></div>':'<button data-analysis-review="'+i+'" '+(x.saving?'disabled':'')+'>Revisar baixa</button>'):(x.result?.plate?plateBox('Placa identificada',x.result.plate):''))+'</div></article>';}).join('');
 $('#analysis-results').querySelectorAll('[data-analysis-review]').forEach(b=>b.onclick=()=>{const x=st.results[+b.dataset.analysisReview];x.review=!x.review;drawAnalysis();});
 $('#analysis-results').querySelectorAll('[data-analysis-save]').forEach(b=>b.onclick=async()=>{const x=st.results[+b.dataset.analysisSave];if(x.saving||x.done||!stockWritable())return;const activeBranch=$('#analysis-branch')?.value||st.branch,live=devices.find(d=>d.id===x.row.id&&d.branch===st.branch);if(activeBranch!==st.branch||!live||live.branch!==st.branch||live.status!=='Estoque'){x.error='Proteção ativa: a baixa só afeta aparelhos em Estoque da filial selecionada.';x.review=false;drawAnalysis();return;}x.saving=true;drawAnalysis();try{await inv('install',live,{key:x.key,confirmed:true,plate:x.result.plate,client:x.result?.client});if(analysisState!==st)return;x.done=true;x.review=false;x.error='';}catch(e){x.error=e.message;}finally{x.saving=false;if(analysisState===st)drawAnalysis();}});
}
$('#stock-analyze').onclick=()=>{
 if(!stockWritable())return;
 const initialBranch=analysisState?.branch||(branch.value!=='all'?branch.value:session.branches[0]?.id||'');
 modal('Análise de baixa','<div class="analysis-intro-row"><p class="analysis-intro">Resultados aparecem durante a consulta. Revise cada placa antes de confirmar a baixa.</p><span class="analysis-guard-pill">Proteção ativa: somente Estoque da filial selecionada</span></div><div class="analysis-toolbar-card"><div class="analysis-controls"><label>Filial da operação<select id="analysis-branch">'+session.branches.map(b=>'<option value="'+esc(b.id)+'" '+(initialBranch===b.id?'selected':'')+'>'+esc(b.name)+'</option>').join('')+'</select></label><div class="analysis-btn-group"><button id="analysis-stop" disabled>Pausar consultas</button><button id="analysis-start" class="primary">'+(analysisState?'Nova análise da seleção':'Iniciar análise')+'</button></div></div><div class="analysis-progress-bar"><div class="analysis-progress-head"><p id="analysis-progress" role="status"></p><strong id="analysis-pct">0%</strong></div><progress id="analysis-meter" value="0" max="1"></progress></div></div><div id="analysis-kpis" class="analysis-kpis"></div><div id="analysis-results"></div>');
 $('#analysis-start').disabled=stockBusy;drawAnalysis();
 $('#analysis-branch').onchange=()=>{if(!analysisState?.running){if(analysisState&&analysisState.branch!==$('#analysis-branch').value)analysisState=null;drawAnalysis();}};
 $('#analysis-stop').onclick=()=>{if(analysisState){analysisState.cancel=true;$('#analysis-stop').disabled=true;$('#analysis-progress').textContent='Pausa solicitada. A consulta atual será preservada.';}};
 $('#analysis-start').onclick=()=>safe(async()=>{
  if(stockBusy)return;const chosen=$('#analysis-branch').value;if(branch.value!==chosen){branch.value=chosen;branch.dispatchEvent(new Event('change'));}
  const {list,ignored}=stockAnalysisRows(chosen);
  if(!list.length){analysisState=null;drawAnalysis();throw Error('Nenhum aparelho em Estoque na filial selecionada para analisar.');}
  const st={branch:chosen,rows:list.map(r=>({...r})),ignored,results:[],running:true,cancel:false};analysisState=st;stockBusy=true;stopMonitor();const token=stockToken;drawAnalysis();
  try{for(const row of st.rows){if(st.cancel||token!==stockToken||!session)break;const started=Date.now();let result;const live=devices.find(d=>d.id===row.id&&d.branch===st.branch);if(!live||live.branch!==st.branch||live.status!=='Estoque'){result={row,error:'Ignorado pela proteção: aparelho fora de Estoque ou de outra filial.'};}else{try{result={row:live,...await inv('analyze',live),key:crypto.randomUUID()};}catch(e){result={row:live,error:e.message};}}if(token!==stockToken||analysisState!==st)break;st.results.push(result);drawAnalysis();if(st.results.length<st.rows.length&&!st.cancel)await new Promise(r=>setTimeout(r,Math.max(0,10000-(Date.now()-started))));}}
  finally{st.running=false;if(token===stockToken){stockBusy=false;drawAnalysis();}}
 });
};
$('#stock-link-selected').onclick=()=>safe(async()=>{
 if(stockBusy)throw Error('Aguarde a operação em andamento.');scopedBranch();const list=selectedRows();if(!list.length)return;stopMonitor();
 modal('Vincular selecionados','<p>'+list.length+' aparelhos selecionados. O sistema reservará identificações conforme a versão e enviará os vínculos um por vez. Respostas inconclusivas ficam para conferência, sem reenvio.</p><button id="batch-link-start" class="primary">Confirmar vinculações</button><button id="batch-link-cancel">Cancelar pendentes</button><p id="batch-link-progress"></p>');
 stockBatchCancel=false;$('#batch-link-cancel').onclick=()=>{stockBatchCancel=true;$('#stock-feedback').textContent='Cancelamento solicitado; o envio em andamento será conferido.';};
 $('#batch-link-start').onclick=e=>{e.target.disabled=true;safe(async()=>{
  stockBusy=true;const token=stockToken;let done=0,failed=0;
  try{for(const original of list){if(stockBatchCancel||token!==stockToken||!session)break;const row=devices.find(d=>d.id===original.id&&d.branch===original.branch);if(!row)continue;
    try{const preview=await inv('link-preview',row);if(preview.operation.state==='prepared'){
      await new Promise(r=>setTimeout(r,10000));if(stockBatchCancel||token!==stockToken||!session){if(session&&token===stockToken)await inv('link-cancel',row,{operation:preview.operation.id});break;}
      const result=await inv('link-confirm',row,{operation:preview.operation.id,confirmed:true});if(result.operations?.find(o=>o.id===preview.operation.id)?.state!=='confirmed')failed++;
    }else if(preview.operation.state!=='confirmed')failed++;}catch{failed++;}
    done++;$('#stock-feedback').textContent='Vinculações: '+done+' de '+list.length+' processados · '+failed+' para conferir.';if($('#batch-link-progress'))$('#batch-link-progress').textContent=$('#stock-feedback').textContent;
    if(done<list.length)await new Promise(r=>setTimeout(r,10000));
  }}finally{stockBusy=false;if(session&&token===stockToken)$('#stock-feedback').textContent+=' Consulte Vinculações e SMS para o resultado salvo.';}
 });};
});
$('#stock-operations').onclick=()=>safe(async()=>{const r=await inv('operations');modal('Vinculações e SMS',r.rows.length?r.rows.map(o=>'<div class="analysis-row"><strong>'+esc(o.serial)+' · '+esc(o.kind)+'</strong><span>'+esc(o.state)+' · '+esc(o.plate||'')+' · '+esc(o.message||'')+'</span>'+(o.kind==='link'?'<button data-check-op="'+esc(o.id)+'" data-device="'+esc(o.device_id)+'">'+(o.state==='prepared'?'Cancelar preparação':'Conferir')+'</button>':'')+'</div>').join(''):'<p>Sem operações registradas.</p>');document.querySelectorAll('[data-check-op]').forEach(b=>b.onclick=()=>safe(async()=>{const row=devices.find(d=>d.id===b.dataset.device),op=r.rows.find(o=>o.id===b.dataset.checkOp);await inv(op.state==='prepared'?'link-cancel':'link-check',row,{operation:op.id});$('#stock-dialog-message').textContent='Operação conferida. Reabra para atualizar.';}));});
$('#stock-integrations').onclick=()=>safe(async()=>{const r=await inv('integrations');modal('Integrações','<p>'+esc(r.apis)+'</p><p>'+esc(r.storage)+'</p><p>'+esc(r.sms.message)+'</p>'+(session.permissions.owner?'<button id="galaxy-pair">Preparar conexão própria do Galaxy</button>':''));if($('#galaxy-pair'))$('#galaxy-pair').onclick=e=>{e.target.disabled=true;safe(async()=>{const p=await inv('gateway-pair');modal('Conectar Galaxy · credencial privada','<p>Use esta credencial somente no dispositivo autorizado. Não coloque no GitHub ou em links públicos. Uma nova preparação invalida a credencial anterior.</p><label>Endpoint<input readonly value="'+esc(location.origin+p.endpoint)+'"></label><label>Filial<input readonly value="'+esc(p.branch)+'"></label><label>Token Bearer<input readonly value="'+esc(p.token)+'"></label><p>O aplicativo/ponte precisa usar o protocolo próprio de consulta e confirmação. Nenhum SMS é enviado ao preparar a conexão.</p>');}).finally(()=>e.target.disabled=false);};});
$('#stock-report').onclick=()=>{modal('Relatório de estoque','<p>'+filtered.length+' aparelhos no recorte atual</p><div class="stock-toolbar"><button id="report-csv">Baixar CSV</button><button id="report-print">Imprimir / salvar PDF</button></div><div class="table-scroll"><table><thead><tr><th>Série</th><th>Identificação</th><th>Placa</th><th>Operadora</th><th>Situação</th></tr></thead><tbody>'+filtered.map(r=>'<tr>'+[r.serial,r.identification,r.plate,r.carrier,stockLabel(r.status)].map(v=>'<td>'+esc(v||'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');$('#report-csv').onclick=()=>$('#export').click();$('#report-print').onclick=()=>window.print();};
