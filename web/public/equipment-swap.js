export function mountEquipmentSwap(host,{request,serial,done,initialPlate='',expectedOutgoing='',onState=()=>{}}){
 host.innerHTML='<div class="swap-bar"><strong>ÁREA DE TROCA</strong><label>Placa de destino<input maxlength="30" placeholder="Digite a placa" aria-label="Placa de destino" autocomplete="off"></label><button type="button" class="primary" disabled>TROCAR</button></div><p class="swap-summary" role="status">O aparelho desta janela será instalado na placa informada.</p>';
 const input=host.querySelector('input'),button=host.querySelector('button'),summary=host.querySelector('p');let revision=0,timer,expiry,preview=null,pending=null,busy=false,stopped=false,retryReady=false;
 const current=n=>!stopped&&host.isConnected&&n===revision;
 input.value=initialPlate;input.readOnly=!!initialPlate;input.disabled=true;
 const check=s=>{if(expectedOutgoing&&(s?.outgoing?.serial!==expectedOutgoing||s?.incoming?.serial!==serial||(initialPlate&&String(s?.outgoing?.plate).replace(/[^a-z0-9]/gi,'').toUpperCase()!==initialPlate.replace(/[^a-z0-9]/gi,'').toUpperCase())))throw Error('O aparelho vinculado à placa difere do registro. Confira a identificação antes de trocar.');};
 const emit=()=>onState({busy,pending:!!pending});
 async function prepare(n){
  if(!current(n)||input.value.trim().length<3)return;
  summary.textContent='Conferindo placa e aparelhos…';
  try{const r=await request({action:'preview',serial,plate:input.value.trim()});if(!current(n))return;check(r.snapshot);preview=r;const s=r.snapshot;
   summary.textContent='Instalar '+s.incoming.serial+' em '+s.outgoing.plate+' · '+(s.client||s.model||'Veículo confirmado')+' · Retirar '+s.outgoing.serial+' para '+s.incoming.plate+' (Reparo).';button.disabled=false;
   expiry=setTimeout(()=>{preview=null;button.disabled=false;button.textContent='ATUALIZAR CONFERÊNCIA';summary.textContent='Conferência vencida. Atualize antes de trocar.';},55000);
  }catch(e){if(current(n))summary.textContent=e.message;}
 }
 input.oninput=()=>{if(busy||pending)return;clearTimeout(timer);clearTimeout(expiry);preview=null;button.disabled=true;const n=++revision;timer=setTimeout(()=>prepare(n),650);};
 button.onclick=async()=>{
  if(busy)return;if(!preview&&!pending){retryReady=false;button.disabled=true;button.textContent='TROCAR';await prepare(revision);return;}busy=true;emit();clearTimeout(expiry);input.disabled=true;button.disabled=true;summary.textContent=pending?'Conferindo troca sem repetir envios…':'Realizando troca…';
  const id=pending||preview.id;pending=id;emit();
  try{const r=await request({action:'execute',id});if(stopped)return;summary.textContent=r.message;if(r.ok){pending=null;preview=null;button.textContent='CONCLUÍDO';await done?.();}else{button.textContent='CONFERIR TROCA';}}
  catch(e){if(!stopped){summary.textContent=e.message;button.textContent='CONFERIR TROCA';if(e.status===409){try{const status=await request(null);if(!status.operation){pending=null;preview=null;input.disabled=false;retryReady=!!initialPlate;button.textContent=retryReady?'ATUALIZAR CONFERÊNCIA':'TROCAR';}}catch{}}}}
  finally{busy=false;if(!stopped){button.disabled=!pending&&!retryReady;emit();}}
 };
 request(null).then(r=>{if(stopped)return;if(!r.operation){input.disabled=false;if(initialPlate)void prepare(revision);return;}check(r.operation.snapshot);clearTimeout(timer);clearTimeout(expiry);revision++;preview=null;pending=r.operation.id;input.disabled=true;input.value=r.operation.snapshot.outgoing.plate;button.textContent='CONFERIR TROCA';button.disabled=false;summary.textContent=r.operation.result?.message||'Há uma troca pendente. Confira para continuar.';emit();}).catch(e=>{summary.textContent=e.message||'Não foi possível verificar pendências. Reabra a janela antes de trocar.';input.disabled=true;});
 return()=>{stopped=true;revision++;clearTimeout(timer);clearTimeout(expiry);};
}
