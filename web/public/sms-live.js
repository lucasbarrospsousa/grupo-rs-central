const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={queued:'Na fila',pending:'Aguardando retorno',received:'Recebido pelo Galaxy',sending:'Enviando',sent:'SMS enviado',delivered:'Entrega confirmada',failed:'Falhou',cancelled:'Cancelado',expired:'Expirado',indeterminate:'Conferência necessária'};
export async function openSms({repo,branch,row,showModal,notify}){
 if(branch!=='imperatriz'||!/^024\d{6}$/.test(row.serial))return notify('SMS disponível para aparelhos 024 de Imperatriz.');
 showModal('Enviar comando por SMS','<p id="sms-prepare">Consultando telefone e conexão com o Galaxy…</p>','medium');
 const target=document.querySelector('#sms-prepare');
 try{
  const [equipment,health]=await Promise.all([repo.request('integrations/equipment?'+new URLSearchParams({branch,serial:row.serial})),repo.request('integrations/gateway?branch='+branch)]);
  if(!target.isConnected)return;
  if(!health.ok)throw Error('Ponte desconectada. Mantenha o computador ligado e o Gateway ativo.');
  const digits=String(equipment.phone||'').replace(/\D/g,''),phone='+'+(digits.startsWith('55')?digits:'55'+digits);
  if(!/^\+55[1-9]\d{9,10}$/.test(phone))throw Error('A plataforma não confirmou um telefone válido.');
  target.outerHTML=`<form id="sms-compose"><p>Aparelho <b>${esc(row.serial)}</b> • telefone confirmado <b>${esc(phone)}</b></p><label class="field">Comando<textarea name="command" required maxlength="160" rows="3"></textarea></label><p>Confira o comando e o destinatário. Envio não comprova execução pelo aparelho.</p><label><input type="checkbox" required> Conferi o destinatário e autorizo este envio.</label><div class="form-actions"><button class="primary">Confirmar envio</button></div><p id="sms-compose-result" role="status"></p></form>`;
  const form=document.querySelector('#sms-compose');let submitted=false;
  form.onsubmit=async e=>{e.preventDefault();if(submitted)return;const command=form.elements.command.value;if(!/^[\x20-\x7e]{1,160}$/.test(command)||!command.trim())return notify('Use texto simples, sem quebras, com até 160 caracteres.');submitted=true;form.querySelector('button').disabled=true;const out=form.querySelector('#sms-compose-result');out.textContent='Registrando pedido…';try{const r=await repo.request('integrations/sms?branch='+branch,{method:'POST',body:{id:row.id,version:row.version,command,phone,confirmed:true}});out.textContent=r.message+' Acompanhe no Painel SMS.';}catch{out.textContent='Confirmação pendente. Consulte o Painel SMS antes de criar outro pedido.';}};
 }catch(e){if(target.isConnected)target.textContent=e.message;}
}
export function mountSmsLive({repo,branch,notify}){
 const anchor=document.querySelector('.sms-history'),refresh=document.querySelector('#sms-refresh');let busy=false;
 document.querySelector('.sms-heading p').textContent='Acompanhamento automático • computador como ponte para o Galaxy';anchor.querySelector('p').textContent='Últimos 100 pedidos do site • atualiza a cada 15 segundos';
 async function update(){if(busy||!anchor.isConnected)return;busy=true;refresh.disabled=true;try{
  const [data,health]=await Promise.all([repo.request('integrations/operations?branch='+branch),repo.request('integrations/gateway?branch='+branch)]);if(!anchor.isConnected)return;
  const rows=data.rows.filter(r=>r.kind==='sms');document.querySelector('.sms-connection').textContent=health.ok?'● Galaxy conectado pela ponte deste computador.':'● Ponte sem conexão recente. Os últimos retornos continuam preservados; nenhum pedido é reenviado automaticamente.';
  const counts=[rows.filter(r=>['queued','pending','received','sending'].includes(r.state)).length,rows.filter(r=>['sent','delivered'].includes(r.state)).length,rows.filter(r=>r.state==='delivered').length,rows.filter(r=>['failed','expired','indeterminate'].includes(r.state)).length];document.querySelectorAll('.sms-metrics strong').forEach((s,i)=>s.textContent=counts[i]);
  anchor.querySelector('tbody').innerHTML=rows.map((r,i)=>`<tr><td>${esc(r.serial)}<small>${esc(r.payload.phone)}</small></td><td>${esc(labels[r.state]||r.state)}</td><td>${esc(new Date(r.created_at).toLocaleString('pt-BR'))}</td><td>${r.result?.remote_at?esc(new Date(Number(r.result.remote_at)*1000).toLocaleString('pt-BR')):'—'}</td><td><button data-sms-job="${i}">Ver pedido</button></td></tr>`).join('')||'<tr><td colspan="5">Nenhum pedido criado pelo site.</td></tr>';
  anchor.querySelectorAll('[data-sms-job]').forEach(b=>b.onclick=()=>{const r=rows[Number(b.dataset.smsJob)];document.querySelector('#sms-detail').textContent=`${r.serial} • ${labels[r.state]||r.state} • Comando: ${r.payload.command}. Sem retorno, não reenviar automaticamente.`;});
 }catch(e){if(anchor.isConnected)document.querySelector('.sms-connection').textContent='Consulta pendente: '+e.message;}finally{busy=false;refresh.disabled=false;}}
 refresh.onclick=update;void update();const timer=setInterval(()=>{if(!anchor.isConnected){clearInterval(timer);return;}void update();},15000);
}
