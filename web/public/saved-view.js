// One request per visible query/revision; never consults suppliers. The repository
// validates the authenticated identity before exposing persistent snapshots.
export function savedView(repo,branch,endpoint,root,render,{revision:version=()=>repo.writeVersion||0}={}){
 let key='',value=null,timer,serial=0;
 return {get(params){
  const query=new URLSearchParams({branch,...params}).toString(),next=endpoint+'?'+query,revision=version();
  if(key!==next+'|'+revision){key=next+'|'+revision;const current=++serial;clearTimeout(timer);value=repo.peekView(branch,next);root.setAttribute('aria-busy','true');timer=setTimeout(async()=>{if(!root.isConnected)return;try{const result=await repo.readView(branch,next);if(current!==serial||!root.isConnected)return;value=result;const active=document.activeElement,id=active?.id,start=active?.selectionStart,end=active?.selectionEnd;render();if(id&&root.contains(document.getElementById(id))){const input=document.getElementById(id);input.focus();if(typeof start==='number')input.setSelectionRange(start,end);}root.querySelector('[data-view-error]')?.remove();}catch(e){if(current===serial&&root.isConnected){let message=root.querySelector('[data-view-error]');if(!message){message=document.createElement('p');message.dataset.viewError='';message.setAttribute('role','status');root.prepend(message);}message.textContent=e.message+' Use Atualizar para tentar novamente.';}}finally{if(current===serial)root.removeAttribute('aria-busy');}},params.query||params.search?250:0);}
  return value;
 },refresh(){key='';serial++;clearTimeout(timer);}};
}
