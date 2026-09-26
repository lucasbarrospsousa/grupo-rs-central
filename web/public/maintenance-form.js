const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reasons=['Sem comunicação','Localização errada','Troca de aparelho'];
const media=['App de rastreamento','Suporte do rastreio','Consultor informou'];
export function openVisitForm({repo,branch,showModal,render,visit=null}){
 if(!visit&&branch!=='imperatriz'){showModal('Novo atendimento','<p>A consulta de cliente e veículo deste fluxo está disponível em Imperatriz. O histórico desta filial permanece disponível.</p>','medium');return;}
 const choices=(name,items,value)=>`<fieldset class="visit-options"><legend>${name==='reason'?'Motivo':'Como o problema foi identificado'}</legend>${items.map(text=>`<label><input type="radio" name="${name}" value="${esc(text)}" ${text===value?'checked':''} required>${esc(text)}</label>`).join('')}</fieldset>`;
 showModal(visit?'Editar relatório':'Registrar atendimento',`<form id="visit-form">
 ${visit?`<div class="visit-identity"><strong>${esc(visit.client)}</strong><p>${esc(visit.plate)} • Aparelho ${esc(visit.currentSerial)}</p><small>Entrada ${esc(visit.entry)} • identidade original preservada</small></div>`:`<label class="field">Buscar cliente na plataforma<input id="visit-client-search" placeholder="Digite ao menos 2 caracteres" autocomplete="off" maxlength="120"></label><div id="visit-client-results" class="visit-client-results"></div><label class="field">Veículo do cliente<select id="visit-vehicle" required disabled><option value="">Selecione primeiro o cliente</option></select></label><p id="visit-device">Aparelho de chegada: aguardando seleção</p>`}
 ${choices('reason',reasons,visit?.reason||'Sem comunicação')}${choices('medium',media,visit?.medium||'App de rastreamento')}
 <div id="visit-replacement" hidden><label class="field">Pesquisar aparelho em estoque<input id="visit-stock-search" placeholder="Número de série"></label><label class="field">Aparelho para instalação<select id="visit-stock"><option value="">Selecione o aparelho</option></select></label><small>Salva o relatório e dá baixa no estoque da Central. O vínculo na plataforma permanece preservado.</small></div>
 ${visit?.installSerial?`<p>Instalação registrada: <strong>${esc(visit.installSerial)}</strong>. Esta edição preserva a baixa já realizada.</p>`:''}
 <label class="field">Relato / observações<textarea name="notes" maxlength="2000" rows="4">${esc(visit?.notes||'')}</textarea></label>
 <p id="visit-form-status" role="status" aria-live="polite"></p><div class="form-actions"><button type="submit" class="primary" ${visit?'':'disabled'}>Salvar relatório</button></div></form>`,'medium');
 const form=document.querySelector('#visit-form'),msg=form.querySelector('#visit-form-status'),submit=form.querySelector('[type=submit]');
 let client=null,vehicle=null,clientEpoch=0,vehicleEpoch=0,timer,controller=null,busy=false;
 const stocks=repo.list(branch).filter(r=>r.status==='Estoque');
 const stockSelect=form.querySelector('#visit-stock');
 const drawStock=()=>{const selected=stockSelect.value,q=form.querySelector('#visit-stock-search').value.trim();stockSelect.innerHTML='<option value="">Selecione o aparelho</option>'+stocks.filter(r=>r.serial.includes(q)).map(r=>`<option value="${esc(r.id)}">${esc(r.serial)} • ${esc(r.identification||'Sem identificação')}</option>`).join('');if([...stockSelect.options].some(o=>o.value===selected))stockSelect.value=selected;};drawStock();
 form.querySelector('#visit-stock-search').oninput=drawStock;
 const updateReason=()=>{const swapping=form.elements.reason.value==='Troca de aparelho';form.querySelector('#visit-replacement').hidden=!swapping||!!visit;stockSelect.required=swapping&&!visit;};
 form.querySelectorAll('[name=reason]').forEach(r=>{r.onchange=updateReason;if(visit&&(visit.installSerial||r.value==='Troca de aparelho'))r.disabled=true;});updateReason();
 const valid=()=>{submit.disabled=busy||(!visit&&(!client||!vehicle?.serial));};
 const live=()=>form.isConnected&&repo.currentBranch===branch;
 if(!visit){
 const results=form.querySelector('#visit-client-results'),select=form.querySelector('#visit-vehicle');
 const resetVehicle=()=>{vehicle=null;vehicleEpoch++;select.disabled=true;select.innerHTML='<option value="">Selecione primeiro o cliente</option>';form.querySelector('#visit-device').textContent='Aparelho de chegada: aguardando seleção';valid();};
 form.querySelector('#visit-client-search').oninput=()=>{
  clearTimeout(timer);controller?.abort();client=null;resetVehicle();results.replaceChildren();const epoch=++clientEpoch,q=form.querySelector('#visit-client-search').value.trim();msg.textContent='';if(q.length<2)return;
  timer=setTimeout(async()=>{controller=new AbortController();msg.textContent='Consultando clientes…';try{const data=await repo.request('integrations/clients?branch='+branch+'&q='+encodeURIComponent(q),{signal:controller.signal});if(!live()||epoch!==clientEpoch)return;msg.textContent=data.rows.length?'Selecione o cliente confirmado na plataforma.':'Nenhum cliente encontrado.';
   results.innerHTML=data.rows.map((r,i)=>`<button type="button" data-client="${i}">${esc(r.name)}</button>`).join('');
   results.querySelectorAll('[data-client]').forEach(button=>button.onclick=async()=>{client=data.rows[Number(button.dataset.client)];resetVehicle();const selectedClient=client,version=vehicleEpoch;results.innerHTML='<strong>'+esc(client.name)+'</strong>';msg.textContent='Consultando veículos do cliente…';try{const response=await repo.request('integrations/client-vehicles?branch='+branch+'&client='+encodeURIComponent(client.id));if(!live()||version!==vehicleEpoch||client!==selectedClient)return;select.disabled=false;select.innerHTML='<option value="">Selecione o veículo</option>'+response.rows.map((v,i)=>`<option value="${i}">${esc(v.plate)} • ${esc(v.serial||'Aparelho não informado')}</option>`).join('');msg.textContent=response.rows.length?'Selecione um veículo.':'Este cliente não possui veículos retornados pela plataforma.';select.onchange=()=>{vehicle=response.rows[Number(select.value)];if(select.value==='')vehicle=null;form.querySelector('#visit-device').textContent='Aparelho de chegada: '+(vehicle?.serial||'não informado');msg.textContent='';valid();};}catch(error){if(live()&&version===vehicleEpoch){msg.textContent=error.message;client=null;valid();}}});
  }catch(error){if(live()&&epoch===clientEpoch)msg.textContent=error.message;}},500);
 };
 }
 const dialog=form.closest('dialog');dialog?.addEventListener('close',()=>{clearTimeout(timer);controller?.abort();clientEpoch++;vehicleEpoch++;},{once:true});
 form.onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;valid();msg.textContent='Conferindo e salvando o relatório…';form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
 try{
  const reason=form.elements.reason.value,medium=form.elements.medium.value,notes=form.elements.notes.value;
  if(visit)await repo.updateReport(visit,{reason,medium,notes});
  else{const device=repo.list(branch).find(r=>r.serial===vehicle?.serial),replacement=stocks.find(r=>r.id===stockSelect.value);await repo.saveReport({branch,id:form.dataset.requestId||(form.dataset.requestId=crypto.randomUUID()),vehicle:device?.id,vehicleVersion:device?.version,clientId:client.id,clientName:client.name,vehicleId:vehicle.vehicle_id,plate:vehicle.plate,reason,medium,notes,replacement:reason==='Troca de aparelho'?replacement?.id:'',replacementVersion:replacement?.version});}
  dialog.close();render();
 }catch(error){msg.textContent=error.message;busy=false;form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=false);if(visit)form.querySelectorAll('[name=reason]').forEach(r=>r.disabled=!!visit.installSerial||r.value==='Troca de aparelho');valid();}
 };
}
