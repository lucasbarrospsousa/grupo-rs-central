import {recoverBridge} from './bridge-recovery.js';
import {smsPhone,validSmsCommand,smsCanSend,smsSubmissionOutcome} from './sms-compose-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={queued:'Na fila',pending:'Aguardando retorno',received:'Recebido pelo Galaxy',sending:'Enviando',sent:'SMS enviado',delivered:'Entrega confirmada',failed:'Falhou',cancelled:'Cancelado',expired:'Expirado',indeterminate:'Conferência necessária'};
export function openSms({repo,branch,row,showModal,notify,navigate}){
 if(!['imperatriz','araguaina','acailandia','maraba'].includes(branch)||!/^024\d{6}$/.test(row.serial))return notify('SMS disponível para aparelhos com série 024 nas bases autorizadas.');
 const base=repo.user?.branches?.find(b=>b.id===branch)?.name||branch;
 showModal('Enviar comando por SMS',`<form id="sms-compose" class="sms-direct">
 <div class="sms-saved"><div><small>Telefone cadastrado</small><strong id="sms-saved-phone">${esc(row.phone||'Não informado')}</strong></div><div><small>APN cadastrada</small><strong id="sms-saved-apn">${esc(row.apn||'Não informada')}</strong></div><span>Dados salvos na Central</span></div>
 <div class="sms-validation" role="status" aria-live="polite"><span id="sms-phone-state">◌ Validando telefone…</span><span id="sms-gateway-state">◌ Verificando Galaxy…</span></div>
 <div class="sms-direct-columns"><div class="sms-compose-main"><div class="sms-presets" role="group" aria-label="Tipos de comando"><button type="button" data-sms-preset="standard" aria-pressed="false"><span aria-hidden="true">⚙</span>Configuração padrão</button><button type="button" data-sms-preset="reset" aria-pressed="false"><span aria-hidden="true">↻</span>Reiniciar</button><button type="button" data-sms-preset="clear" aria-pressed="false"><span aria-hidden="true">⌫</span>Limpar memória</button></div>
 <label for="sms-command">Mensagem / comando</label><textarea id="sms-command" name="command" maxlength="160" rows="5" placeholder="Selecione um comando ou digite a mensagem…"></textarea><div class="sms-compose-counter"><span id="sms-char-count">0 / 160 caracteres</span><span>Texto simples · um SMS</span></div><p id="sms-preset-note" role="status">Selecione um comando ou edite a mensagem.</p></div>
 <aside class="sms-compose-preview"><div class="sms-preview-heading">PRÉVIA DA MENSAGEM</div><small>Para</small><strong id="sms-recipient">${esc(row.phone||'Aguardando telefone')}</strong><div class="sms-message-bubble"><p id="sms-preview-text" class="placeholder">Sua mensagem aparecerá aqui.</p></div><div class="sms-preview-footer">Envio pelo Galaxy</div></aside></div>
 <div class="sms-direct-footer"><p id="sms-compose-result" role="status">Validando telefone e conexão em segundo plano…</p><button class="primary" id="sms-send" disabled>Enviar para a fila</button></div></form>`,'sms-composer','Aparelho '+row.serial+' · '+base);
 const modal=document.querySelector('#modal'),form=document.querySelector('#sms-compose'),find=id=>form.querySelector('#sms-'+id),input=find('command'),send=find('send');
 const state={phone:'',connected:false,validatedAt:0,command:'',submitting:false};let standard=null,presetRequest=0,closed=false,gatewayBusy=false,timer;
 const controller=new AbortController(),alive=()=>!closed&&modal.open&&form.isConnected;
 const request=path=>repo.request(path,{signal:controller.signal});
 const cleanup=()=>{if(closed)return;closed=true;clearInterval(timer);controller.abort();observer.disconnect();modal.removeEventListener('close',onClose);};
 const onClose=()=>{if(!modal.open||!form.isConnected)cleanup();};const observer=new MutationObserver(()=>{if(!form.isConnected)cleanup();});observer.observe(modal,{childList:true});modal.addEventListener('close',onClose);
 const draw=()=>{if(!alive())return;state.command=input.value;send.disabled=!smsCanSend(state);send.textContent=state.submitting?'Adicionando à fila…':'Enviar para a fila';find('char-count').textContent=input.value.length+' / 160 caracteres';find('preview-text').textContent=input.value||'Sua mensagem aparecerá aqui.';find('preview-text').classList.toggle('placeholder',!input.value);find('recipient').textContent=state.phone||row.phone||'Aguardando telefone';find('compose-result').textContent=state.submitting?'Aguardando confirmação da fila…':!state.phone||!state.connected?'Envio bloqueado até validar telefone e conexão.':!validSmsCommand(input.value)?'Digite um comando em texto simples, com até 160 caracteres.':'Ao enviar, acompanhe o resultado no Painel SMS.';};
 input.oninput=()=>{standard=null;presetRequest++;form.querySelectorAll('[data-sms-preset]').forEach(b=>b.setAttribute('aria-pressed','false'));find('preset-note').textContent='Mensagem personalizada. Confira o comando antes de enviar.';draw();};
 form.querySelectorAll('[data-sms-preset]').forEach(button=>button.onclick=async()=>{
  if(state.submitting)return;const kind=button.dataset.smsPreset,id=++presetRequest;let template=null,command=kind==='reset'?'reset,123456':'locache,123456,1';
  if(kind==='standard'){button.disabled=true;find('preset-note').textContent='Conferindo a APN salva…';try{template=await request('integrations/sms-template?'+new URLSearchParams({branch,serial:row.serial}));command=template.command;}catch(e){if(alive()&&id===presetRequest)find('preset-note').textContent=e.message;return;}finally{if(alive())button.disabled=state.submitting;}}
  if(!alive()||id!==presetRequest||state.submitting)return;input.value=command;standard=template;form.querySelectorAll('[data-sms-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(template)find('saved-apn').textContent=template.apn;find('preset-note').textContent=template?'Configuração conforme a APN salva: '+template.apn:kind==='reset'?'Solicita a reinicialização do aparelho.':'Solicita a limpeza da memória do aparelho.';draw();
 });
 form.onsubmit=async e=>{e.preventDefault();state.command=input.value;if(!smsCanSend(state))return;state.submitting=true;presetRequest++;input.readOnly=true;form.querySelectorAll('[data-sms-preset]').forEach(b=>b.disabled=true);draw();let result,error;
  try{result=await repo.request('integrations/sms?branch='+branch,{method:'POST',body:{id:row.id,version:row.version,command:input.value,phone:state.phone,confirmed:true,command_mode:standard?'standard':'custom',apn:standard?.apn||''}});}catch(e){error=e;}
  const outcome={...smsSubmissionOutcome(result,error),branch,serial:row.serial};repo.smsSubmissionResult=outcome;
  if(alive()){cleanup();modal.close();navigate('sms');notify(outcome.message);}
 };
 async function validatePhone(){try{const e=await request('integrations/equipment?'+new URLSearchParams({branch,serial:row.serial}));if(!alive())return;const phone=smsPhone(e.phone);if(e.serial!==row.serial||e.ok===false||!phone)throw Error('A plataforma não confirmou o telefone deste aparelho.');state.phone=phone;find('phone-state').textContent='✓ Telefone validado'+(smsPhone(row.phone)!==phone?' · destino atual: '+phone:'');find('phone-state').dataset.state='ok';}catch(e){if(!alive())return;state.phone='';find('phone-state').textContent=e.message;find('phone-state').dataset.state='error';}draw();}
 async function validateGateway(){if(gatewayBusy||!alive()||state.submitting)return;gatewayBusy=true;try{let h=await request('integrations/gateway?branch='+branch);if(h.connected&&h.send_enabled===false)throw Error(h.error||'Galaxy em modo diagnóstico; envio desabilitado.');h=await recoverBridge({health:h,read:()=>request('integrations/gateway?branch='+branch),active:alive,progress:()=>{if(alive()){state.connected=false;find('gateway-state').textContent='◌ Aguardando conexão do Galaxy…';draw();}}});if(!alive())return;if(!h?.ok)throw Error(h?.error||'Galaxy sem conexão recente. Aguardando reconexão.');state.connected=true;state.validatedAt=Date.now();find('gateway-state').textContent='✓ Galaxy conectado';find('gateway-state').dataset.state='ok';}catch(e){if(!alive())return;state.connected=false;find('gateway-state').textContent=e.message;find('gateway-state').dataset.state='error';}finally{gatewayBusy=false;draw();}}
 draw();void validatePhone();void validateGateway();timer=setInterval(()=>{if(!alive()){cleanup();return;}draw();void validateGateway();},30000);
}
export function mountSmsLive({repo,branch,notify}){
 const root=document.querySelector('#page'),panel=root.smsPanel,refresh=root.querySelector('#sms-refresh');if(!panel)return;let busy=false;
 const alive=()=>refresh.isConnected&&root.smsPanel===panel;
 if(repo.smsSubmissionResult?.branch===branch){panel.result(repo.smsSubmissionResult);delete repo.smsSubmissionResult;}
 const operations='integrations/operations?branch='+branch,cached=repo.peekView?.(branch,operations);if(cached)panel.setRows(cached.rows.filter(r=>r.kind==='sms'));
 async function update(force=false){if(busy||!alive())return;busy=true;refresh.disabled=true;
  const results=await Promise.allSettled([repo.readView?repo.readView(branch,operations,{force}):repo.request(operations),repo.request('integrations/gateway?branch='+branch)]);
  if(!alive())return;
  const [data,health]=results;
  if(data.status==='fulfilled')panel.setRows(data.value.rows.filter(r=>r.kind==='sms'));
  const h=health.status==='fulfilled'?health.value:null;
  const connection=h?(h.connected&&h.send_enabled===false?'Galaxy em modo diagnóstico • envio desabilitado.':h.ok?'● Galaxy conectado'+(h.mode==='cloud'?' diretamente à Central.':' pela ponte local.'):'Galaxy sem conexão recente • pedidos e retornos preservados. Não há reenvio automático.'):'Conexão não verificada: '+health.reason.message;
  panel.connection(connection+' • Verificado às '+new Date().toLocaleTimeString('pt-BR')+' • Atualização a cada 15 s'+(data.status==='rejected'?' • Consulta dos pedidos pendente: '+data.reason.message:''));
  busy=false;refresh.disabled=false;
 }
 refresh.onclick=()=>update(true);void update();const timer=setInterval(()=>{if(!alive()){clearInterval(timer);return;}void update();},15000);
}
