export function mountEquipmentSwap(host,{request,serial,done}){
 host.innerHTML='<div class="swap-bar"><strong>ÁREA DE TROCA</strong><label>Placa de destino<input maxlength="30" placeholder="Digite a placa" aria-label="Placa de destino" autocomplete="off"></label><button class="primary" disabled>TROCAR</button></div><p class="swap-summary" role="status">O aparelho desta janela será instalado na placa informada.</p>';
 const input=host.querySelector('input'),button=host.querySelector('button'),summary=host.querySelector('p');let revision=0,timer,expiry,preview=null,pending=null,busy=false,stopped=false;
 const current=n=>!stopped&&host.isConnected&&n===revision;
 input.disabled=true;
 async function prepare(n){
  if(!current(n)||input.value.trim().length<3)return;
  summary.textContent='Conferindo placa e aparelhos…';
  try{const r=await request({action:'preview',serial,plate:input.value.trim()});if(!current(n))return;preview=r;const s=r.snapshot;
   summary.textContent='Instalar '+s.incoming.serial+' em '+s.outgoing.plate+' · '+(s.client||s.model||'Veículo confirmado')+' · Retirar '+s.outgoing.serial+' para '+s.incoming.plate+' (Manutenção).';button.disabled=false;
   expiry=setTimeout(()=>{preview=null;button.disabled=true;summary.textContent='Conferência vencida. Edite a placa para atualizar.';},55000);
  }catch(e){if(current(n))summary.textContent=e.message;}
 }
 input.oninput=()=>{if(busy||pending)return;clearTimeout(timer);clearTimeout(expiry);preview=null;button.disabled=true;const n=++revision;timer=setTimeout(()=>prepare(n),650);};
 button.onclick=async()=>{
  if(busy||(!preview&&!pending))return;busy=true;clearTimeout(expiry);input.disabled=true;button.disabled=true;summary.textContent=pending?'Conferindo troca sem repetir envios…':'Realizando troca…';
  const id=pending||preview.id;pending=id;
  try{const r=await request({action:'execute',id});if(stopped)return;summary.textContent=r.message;if(r.ok){pending=null;preview=null;button.textContent='CONCLUÍDO';await done?.();}else{button.textContent='CONFERIR TROCA';}}
  catch(e){if(!stopped){summary.textContent=e.message;button.textContent='CONFERIR TROCA';if(e.status===409){try{const status=await request(null);if(!status.operation){pending=null;preview=null;input.disabled=false;button.textContent='TROCAR';}}catch{}}}}
  finally{busy=false;if(!stopped)button.disabled=!pending;}
 };
 request(null).then(r=>{if(stopped)return;if(!r.operation){input.disabled=false;return;}clearTimeout(timer);clearTimeout(expiry);revision++;preview=null;pending=r.operation.id;input.disabled=true;input.value=r.operation.snapshot.outgoing.plate;button.textContent='CONFERIR TROCA';button.disabled=false;summary.textContent=r.operation.result?.message||'Há uma troca pendente. Confira para continuar.';}).catch(()=>{summary.textContent='Não foi possível verificar pendências. Reabra a janela antes de trocar.';input.disabled=true;});
 return()=>{stopped=true;revision++;clearTimeout(timer);clearTimeout(expiry);};
}
