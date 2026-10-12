export function mountOwnerSearch(host,{repo,branch,input,onSelect}){
 host.className='stock-owner-search';
 host.innerHTML='<button type="button">Consultar associado</button><select aria-label="Selecionar titular" hidden></select><span role="status"></span>';
 const button=host.querySelector('button'),select=host.querySelector('select'),status=host.querySelector('span');let revision=0;
 const request=(action,params)=>repo.request('integrations/'+action+'?'+new URLSearchParams({branch,...params}));
 host.closest('section')?.querySelector('#stock-clear')?.addEventListener('click',()=>input.dispatchEvent(new Event('input')));
 input.addEventListener('input',()=>{revision++;button.disabled=false;select.hidden=true;status.textContent='';});
 button.onclick=async()=>{
  const q=input.value.trim(),current=++revision;
  if(q.length<3){status.textContent='Digite ao menos 3 caracteres do nome.';return;}
  button.disabled=true;select.hidden=true;status.textContent='Consultando titulares…';
  try{const data=await request('clients',{q,mode:'name'});if(current!==revision||!host.isConnected)return;
   select.replaceChildren(new Option('Selecione o titular',''));
   for(const owner of data.rows||[]){const option=new Option(owner.name+' · cadastro '+owner.id,owner.id);option.dataset.name=owner.name;select.add(option);}
   select.hidden=!data.rows?.length;status.textContent=data.rows?.length?'Selecione o cadastro para confirmar os aparelhos.':'Nenhum titular encontrado nesta base.';
  }catch(e){if(current===revision&&host.isConnected)status.textContent='Consulta pendente: '+e.message;}
  finally{if(current===revision&&host.isConnected)button.disabled=false;}
 };
 select.onchange=async()=>{
  const option=select.selectedOptions[0];if(!option?.value)return;
  const current=++revision;select.disabled=true;onSelect([]);status.textContent='Confirmando veículos e aparelhos…';
  try{const data=await request('stock-owner-search',{client:option.value,name:option.dataset.name});if(current!==revision||!host.isConnected)return;
   onSelect(data.rows);status.textContent=data.rows.length+' aparelhos instalados confirmados'+(data.pending?' · '+data.pending+' vínculos pendentes de conferência':'.');
  }catch(e){if(current===revision&&host.isConnected)status.textContent='Consulta pendente: '+e.message;}
  finally{select.disabled=false;}
 };
}
