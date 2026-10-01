import {normalizeLinkIdentification} from './link-page.js';
import {startEconomyPolling} from './usage-control.mjs';
import {mountSmsLive} from './sms-live.js';
import {openDischarge} from './discharge-panel.js';
import {mountLiveOverview} from './overview-live.js';
import {mountBackupCard} from './backup-card.js';
import {mountLiveTracking} from './tracking-live.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mountIntegrationActions({repo,branch,route,showModal,notify,render}){
 if(route==='overview')mountBackupCard({repo});
 const query=(action,params={})=>repo.request('integrations/'+action+'?'+new URLSearchParams({branch,...params}));
 const syncNote=document.createElement('div');syncNote.className='sync-status';syncNote.hidden=true;syncNote.setAttribute('role','status');syncNote.textContent='Verificando atualização automática…';(document.querySelector('#visits-sync')||document.querySelector('#page')).prepend(syncNote);
 const updateSync=()=>query('sync-status').then(s=>{if(!syncNote.isConnected)return;syncNote.classList.remove('sync-warning');syncNote.textContent=(s.enabled?'Atualização automática ativa':'Atualização automática pausada')+' • ciclo '+s.cycle+' • '+s.completed+'/'+s.total+' aparelhos • intervalo '+s.interval_minutes+' min entre lotes'+(s.alerts.length?' • '+s.alerts.length+' integração(ões) pausada(s)':'');
 syncNote.title=syncNote.textContent;if(route==='maintenance')syncNote.textContent=(s.enabled?(s.completed===s.total?'Consulta concluída':'Consultando '+s.completed+'/'+s.total):'Consulta pausada')+' • ciclo de '+s.interval_minutes+' min';
 if(s.alerts.length){syncNote.classList.add('sync-warning');for(const a of s.alerts){const p=document.createElement('p');p.textContent=a.source+' — '+a.message;syncNote.append(p);}}
 }).catch(e=>{if(syncNote.isConnected)syncNote.textContent='Atualização automática: '+e.message;return false;});
 if(route==='settings')syncNote.remove();else void updateSync();startEconomyPolling(updateSync,{interval:300000,alive:()=>syncNote.isConnected});
 const run=async(button,fn)=>{button.disabled=true;try{await fn();}catch(e){notify(e.message);}finally{button.disabled=false;}};
 const labels={serial:'Número de série',plate:'Placa / identificação',client:'Cliente',phone:'Telefone do chip',iccid:'ICCID',apn:'APN',lat:'Latitude',lng:'Longitude',speed:'Velocidade',ignition:'Ignição',battery:'Bateria',updated_at:'Última comunicação',gps_at:'Data GPS',source:'Fonte',queried_at:'Consultado em',message:'Resultado',category:'Classificação',provider:'Operadora consultada',status:'Situação',operator:'Operadora'};
 const details=(title,data)=>showModal(title,'<div class="detail-list">'+Object.entries(data).filter(([k,v])=>typeof v!=='object'&&!['ok','vehicle_id'].includes(k)).map(([k,v])=>'<div>'+esc(labels[k]||k)+'<b>'+esc(v===null||v===undefined||v===''?'Não informado':v)+'</b></div>').join('')+'</div>','medium');
 if(route==='stock'){
  const analyze=document.querySelector('#stock-analyze');analyze.onclick=()=>openDischarge({repo,branch,showModal,notify,render});
 }

 if(route==='bulk'){
  const sms=document.querySelector('#bulk-sms');if(sms)sms.onclick=()=>notify('Envie pelo botão SMS de cada aparelho no Estoque; confira o telefone e o comando antes de confirmar.');
  const clients=document.querySelector('#bulk-clients');if(clients)clients.onclick=()=>{showModal('Consultar clientes da plataforma','<form id="live-clients-form" class="toolbar"><input name="q" minlength="3" maxlength="120" required aria-label="Placa, série ou identificação" placeholder="Placa, série ou identificação"><button class="primary">Buscar titular</button></form><div id="live-clients-result" role="status"></div>','medium');document.querySelector('#live-clients-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const out=document.querySelector('#live-clients-result');out.textContent='Consultando…';const data=await query('clients',{q:new FormData(e.target).get('q').trim()});out.replaceChildren();for(const item of data.rows){const p=document.createElement('p');p.textContent=item.name;out.append(p);}if(!data.rows.length)out.textContent='Nenhum cliente retornado.';});};};
 }
 if(route==='link'){
  document.querySelector('#link-refresh').onclick=e=>run(e.target,async()=>{await repo.load(branch);render();});
  document.querySelector('#link-review').onclick=e=>run(e.target,async()=>{
   const serial=document.querySelector('#link-serial').textContent,row=repo.list(branch).find(r=>r.serial===serial);
   if(!row)return notify('Selecione um aparelho.');
   const plate=normalizeLinkIdentification(document.querySelector('#link-identification').value);
   showModal('Conferir vínculo pela API','<p>Série <strong>'+esc(serial)+'</strong> • Identificação <strong>'+esc(plate)+'</strong> • Titular <strong>RS300</strong></p><p id="remote-link-result" role="status">Conferindo aparelho, identificação e titular…</p><button id="remote-link-confirm" class="primary" disabled>Confirmar vínculo na plataforma</button>','medium');
   const resultNode=document.querySelector('#remote-link-result'),confirm=document.querySelector('#remote-link-confirm');
   let preview;try{preview=await query('link-preview',{serial,plate});}catch(error){if(resultNode.isConnected)resultNode.textContent=error.message;return;}
   if(!confirm.isConnected||repo.currentBranch!==branch)return;
   resultNode.textContent=preview.confirmed?'O vínculo já está confirmado na API. Confirme para atualizar o estoque da Central.':preview.create_required?'A identificação ainda não existe. Ao confirmar, será criada com titular RS300 e vinculada a este aparelho.':'Aparelho e identificação existentes confirmados. A confirmação associa o aparelho ao RS300 e atualiza o estoque, sem substituir outro vínculo.';
   confirm.textContent=preview.create_required?'Criar identificação e vincular':'Confirmar vínculo na plataforma';
   confirm.disabled=false;
   confirm.onclick=()=>run(confirm,async()=>{
    try{
     const result=await repo.request('integrations/link?branch='+branch,{method:'POST',body:{id:row.id,version:row.version,plate:preview.plate,confirmed:true}});
     if(resultNode.isConnected)resultNode.textContent=result.message;
     if(!result.ok)return;
     await repo.load(branch,{route:'link'});const saved=repo.list(branch).find(d=>d.id===row.id);
     if(!saved||saved.status!=='Estoque'||saved.identification!==preview.plate)throw Error('Vínculo confirmado na plataforma; atualize a lista para conferir o estoque local.');
     if(!confirm.isConnected||repo.currentBranch!==branch)return;
     render();showModal('Vinculação concluída','<p>Série <strong>'+esc(saved.serial)+'</strong> • Identificação <strong>'+esc(saved.identification)+'</strong></p><p>Salvo em Estoque e removido dos aparelhos pendentes.</p><button id="remote-link-done" class="primary">Concluído</button>','medium');
     document.querySelector('#remote-link-done').onclick=()=>document.querySelector('#modal').close();
    }catch(error){if(resultNode.isConnected)resultNode.textContent=error.message;}
   });
  });
 }
 if(route==='sms')mountSmsLive({repo,branch,notify});
 if(['link','sms'].includes(route)){
  const p=document.createElement('section');p.className='panel';p.innerHTML='<h2>Conferir operações pendentes</h2><button>Consultar pendências</button><div></div>';document.querySelector('#page').append(p);p.querySelector('button').onclick=e=>run(e.target,async()=>{const data=await query('operations');const out=p.querySelector('div');out.replaceChildren();for(const op of data.rows.filter(r=>['submitted','pending','prepared','indeterminate'].includes(r.state))){const row=document.createElement('p'),b=document.createElement('button');row.textContent=op.kind+' • '+op.serial+' ';b.textContent='Conferir sem reenviar';b.onclick=()=>run(b,async()=>{const r=await repo.request('integrations/reconcile?branch='+branch,{method:'POST',body:{id:op.id}});notify(r.message||r.state);});row.append(b);out.append(row);}if(!out.children.length)out.textContent='Nenhuma pendência.';});
 }
 if(['stock','tracking','settings'].includes(route)){
  const mountQueryPanel=()=>{
  const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<h2>Consulta das integrações</h2><form class="toolbar" id="integration-query"><select name="action" aria-label="Tipo de consulta"><option value="binding">Vínculo por série</option><option value="location">Localização por série</option><option value="arya">Chip Arya / Innova</option><option value="link">Chip Link Solutions</option></select><input name="number" required inputmode="numeric" placeholder="Série ou ICCID exato" aria-label="Série ou ICCID"><button class="primary">Consultar</button></form><p>Consulta somente leitura • nenhuma alteração automática</p><div id="integration-result" role="status"></div>';if(route==='stock'){showModal('Consulta das integrações','<div id="stock-integration-content"></div>','medium');panel.querySelector('h2').remove();document.querySelector('#stock-integration-content').append(panel);}else document.querySelector('#page').append(panel);
  panel.querySelector('form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),action=f.get('action'),number=f.get('number').trim();run(e.submitter,async()=>{panel.querySelector('#integration-result').textContent='Consultando…';const data=await query(['arya','link'].includes(action)?'carrier':action,['arya','link'].includes(action)?{provider:action,iccid:number}:{serial:number});if(!panel.isConnected)return;if(['arya','link'].includes(action)&&route==='settings')panel.closest('#page').dispatchEvent(new CustomEvent('central-carrier-result',{detail:{source:action,result:data}}));panel.querySelector('#integration-result').textContent=data.ok===false?data.message:'Consulta concluída';details('Resultado da consulta',data);});};
  };
  if(route==='stock')document.querySelector('#stock-integrations').onclick=mountQueryPanel;else mountQueryPanel();
 }
 if(route==='overview')mountLiveOverview({repo,showModal,notify,render});
 if(['records','route'].includes(route))mountLiveTracking({repo,branch,route,query,notify,render});
}
