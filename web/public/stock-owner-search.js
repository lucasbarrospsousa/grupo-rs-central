const pauseMs=750,minIntervalMs=2500,cacheMs=5*60000;
export function mountOwnerSearch(host,{repo,branch,input,onSelect,manual=false}){
 host.className='stock-owner-search';
 host.innerHTML='<select aria-label="Selecionar titular" hidden></select><span role="status"></span>';
 const select=host.querySelector('select'),status=host.querySelector('span'),cache=new Map(),bindings=new Map();
 let revision=0,timer=null,lastStarted=-Infinity,busy=false,composing=false,stopped=false;
 const request=(action,params)=>repo.request('integrations/'+action+'?'+new URLSearchParams({branch,...params}));
 const text=()=>input.value.trim().replace(/\s+/g,' ');
 const eligible=q=>q.length>=3&&q.length<=120&&/^[\p{L}\p{M} .’'’-]+$/u.test(q)&&q.replace(/[^\p{L}]/gu,'').length>=3;
 const current=(id,q)=>!stopped&&host.isConnected&&id===revision&&q===text();
 function show(data){
  select.disabled=false;select.replaceChildren(new Option('Selecione o titular',''));
  for(const owner of data.rows||[]){const option=new Option(owner.name+' · cadastro '+owner.id,owner.id);option.dataset.name=owner.name;select.add(option);}
  if(data.rows?.length===1){select.hidden=true;void choose(data.rows[0]);return;}
  select.hidden=!data.rows?.length;status.textContent=data.rows?.length?'Selecione o titular para confirmar os aparelhos.':'Nenhum titular encontrado nesta base.';
 }
 function schedule(delay=pauseMs){clearTimeout(timer);timer=setTimeout(search,delay);}
 async function search(){
  const q=text(),id=revision,key=q.toLocaleLowerCase('pt-BR');
  if(stopped||!host.isConnected||composing||!eligible(q))return;
  const saved=cache.get(key);if(saved&&Date.now()-saved.at<cacheMs){show(saved.data);return;}
  if(busy){schedule(minIntervalMs);return;}
  const remaining=minIntervalMs-(Date.now()-lastStarted);if(remaining>0){schedule(remaining);return;}
  busy=true;lastStarted=Date.now();status.textContent='Buscando associados…';
  try{const data=await request('clients',{q,mode:'name'});cache.set(key,{data,at:Date.now()});if(cache.size>30)cache.delete(cache.keys().next().value);if(current(id,q))show(data);}
  catch(e){if(current(id,q))status.textContent='Consulta pendente: '+e.message;}
  finally{busy=false;}
 }
 function changed(){revision++;clearTimeout(timer);select.hidden=true;select.disabled=false;status.textContent='';if(!manual&&!composing&&eligible(text()))schedule();}
 const clear=()=>input.dispatchEvent(new Event('input'));
 const clearButton=host.closest('section')?.querySelector('#stock-clear');clearButton?.addEventListener('click',clear);
 const submitted=()=>{changed();if(eligible(text()))schedule(1300);};
 input.addEventListener('stock-search',submitted);
 input.addEventListener('input',changed);
 input.addEventListener('compositionstart',()=>{composing=true;changed();});
 input.addEventListener('compositionend',()=>{composing=false;changed();});
 async function choose(owner){
  if(!owner?.id)return;
  const id=++revision,q=text();clearTimeout(timer);select.disabled=true;onSelect([]);status.textContent='Confirmando veículos e aparelhos…';
  try{const key=String(owner.id),signature=JSON.stringify((repo.list?.(branch)||[]).map(r=>[r.id,r.version,r.serial,r.status,r.plate])),saved=bindings.get(key);
   let entry=saved;if(!entry||entry.signature!==signature||entry.name!==owner.name||Date.now()-entry.at>=cacheMs){
    entry={signature,name:owner.name,at:Date.now(),promise:request('stock-owner-search',{client:owner.id,name:owner.name})};bindings.set(key,entry);if(bindings.size>30)bindings.delete(bindings.keys().next().value);
    entry.promise.catch(()=>{if(bindings.get(key)===entry)bindings.delete(key);});
   }
   const data=await entry.promise;if(!current(id,q))return;
   onSelect(data.rows);status.textContent=data.rows.length+' aparelhos instalados confirmados'+(data.pending?' · '+data.pending+' vínculos pendentes de conferência':'.');
  }catch(e){if(current(id,q))status.textContent='Consulta pendente: '+e.message;}
  finally{if(current(id,q))select.disabled=false;}
 }
 select.onchange=()=>{const option=select.selectedOptions[0];if(option?.value)void choose({id:option.value,name:option.dataset.name});};
 const observer=new MutationObserver(()=>{if(!host.isConnected){stopped=true;revision++;clearTimeout(timer);observer.disconnect();clearButton?.removeEventListener('click',clear);input.removeEventListener('input',changed);input.removeEventListener('stock-search',submitted);cache.clear();bindings.clear();}});
 observer.observe(document.body,{childList:true,subtree:true});
}
