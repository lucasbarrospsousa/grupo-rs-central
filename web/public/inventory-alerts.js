import {notify,clearNotices} from './notices.js';
const types={stock:'Estoque da base',warehouse:'Aparelhos no armazém',chips:'Chips no armazém'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function lowInventory(count,limit){return Number.isInteger(count)&&count>=0&&Number.isInteger(limit)&&limit>=0&&count<=limit;}
let monitor=null,openNotification=null;
if(typeof navigator!=='undefined')navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='central-inventory-open')openNotification?.(event.data);});
export function mountInventoryAlerts({repo,showModal,navigate}){
 if(!repo.real||!repo.user)return;
 openNotification=data=>{if(repo.user?.branches.some(b=>b.id===data.branch)&&['stock','warehouse'].includes(data.route))navigate(data.route,data.branch);};
 const user=repo.user.username,key='central-inventory-alerts:'+user;
 const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{return {};}};
 const access=repo.user.permissions||{},allowed=Object.keys(types).filter(t=>access.owner||(access.views||[]).some(m=>(t==='stock'?['overview','stock']:['warehouse']).includes(m)));
 if(!allowed.length)return;
 if(monitor?.user!==user){monitor?.stop();let stopped=false,busy=false,last=0;const seen=new Map();
  const tick=async()=>{
   if(stopped||busy||!repo.user||repo.user.username!==user)return;
   const config=read();if(!config.enabled||Date.now()-last<120000)return;busy=true;last=Date.now();
   try{for(const branch of repo.user.branches){
    if(stopped||repo.user?.username!==user||!read().enabled)break;
    if(!allowed.some(t=>Number.isInteger(config.limits?.[branch.id]?.[t])))continue;
    try{const counts=await repo.request('integrations/inventory-counts?branch='+branch.id);
     if(stopped||repo.user?.username!==user)break;
     for(const type of allowed){const limit=config.limits?.[branch.id]?.[type],count=counts[type],id=branch.id+':'+type;
      if(!lowInventory(count,limit)){seen.delete(id);continue;}
      if(seen.get(id)===count)continue;seen.set(id,count);
      const text=branch.name+' · '+types[type]+': '+count+' disponível(is). Limite: '+limit+'.';
      showInventoryNotice(text,()=>navigate(type==='stock'?'stock':'warehouse',branch.id));
      if(config.desktop&&globalThis.Notification?.permission==='granted'){
       try{const registration=await navigator.serviceWorker.register('/inventory-notifications-sw.js');await navigator.serviceWorker.ready;await registration.showNotification('Central · Estoque baixo',{body:text,tag:'central-'+user+'-'+id,icon:'/logo.png',data:{route:type==='stock'?'stock':'warehouse',branch:branch.id}});}catch{}
      }
     }
    }catch{/* Failed queries are never interpreted as zero stock. */}
   }}finally{busy=false;}
  };
  const interval=setInterval(tick,120000);const visibility=()=>{if(document.visibilityState==='visible')void tick();};document.addEventListener('visibilitychange',visibility);
  monitor={user,stop(){stopped=true;clearInterval(interval);document.removeEventListener('visibilitychange',visibility);},check(){last=0;void tick();}};
  void tick();
 }
 const host=document.querySelector('.content>.top');if(!host||host.querySelector('#inventory-alert-settings'))return;
 const button=document.createElement('button');button.id='inventory-alert-settings';button.textContent='Alertas de estoque';host.append(button);
 button.onclick=()=>{
  const config=read();
  showModal('Alertas de estoque baixo',`<form id="inventory-alert-form"><label><input type="checkbox" name="enabled" ${config.enabled?'checked':''}> Ativar alertas neste navegador</label><p>Avisa quando a quantidade disponível for igual ou menor que o limite. Deixe vazio para desativar um tipo. Preferências salvas por usuário neste navegador.</p><div class="table-wrap"><table><thead><tr><th>Base</th>${allowed.map(t=>'<th>'+types[t]+'</th>').join('')}</tr></thead><tbody>${repo.user.branches.map(b=>'<tr><th>'+esc(b.name)+'</th>'+allowed.map(t=>'<td><input type="number" min="0" max="100000" step="1" name="'+b.id+':'+t+'" aria-label="'+esc(b.name+' '+types[t])+'" value="'+(Number.isInteger(config.limits?.[b.id]?.[t])?config.limits[b.id][t]:'')+'" placeholder="Desativado" style="width:100%;min-width:90px"></td>').join('')+'</tr>').join('')}</tbody></table></div><label><input type="checkbox" name="desktop" ${config.desktop?'checked':''}> Também notificar no computador</label><p class="muted">Consulta os totais salvos a cada 2 minutos enquanto a Central estiver aberta e a sessão ativa. O navegador pode atrasar a execução em segundo plano. Não recebe alertas com o navegador fechado.</p><p id="inventory-alert-status" role="alert"></p><div class="form-actions"><button class="primary">Salvar alertas</button></div></form>`,'medium');
  const form=document.querySelector('#inventory-alert-form');form.onsubmit=async e=>{e.preventDefault();const config={enabled:form.elements.enabled.checked,desktop:form.elements.desktop.checked,limits:{}};
   for(const b of repo.user.branches){config.limits[b.id]={};for(const t of allowed){const value=form.elements[b.id+':'+t].value;if(value!=='')config.limits[b.id][t]=Number(value);}}
   if(config.desktop){if(!globalThis.Notification||!navigator.serviceWorker){config.desktop=false;form.querySelector('#inventory-alert-status').textContent='Notificação no computador não disponível. Alertas na tela ativados.';}else{try{const permission=await Notification.requestPermission();if(permission!=='granted'){config.desktop=false;form.querySelector('#inventory-alert-status').textContent='Permissão não concedida. Os alertas continuam na tela.';}}catch{config.desktop=false;}}}
   try{localStorage.setItem(key,JSON.stringify(config));monitor.check();if(!config.enabled)clearNotices('inventory');if(!form.querySelector('#inventory-alert-status').textContent)form.querySelector('#inventory-alert-status').textContent='Preferências salvas.';}catch{form.querySelector('#inventory-alert-status').textContent='Não foi possível salvar as preferências neste navegador.';}
  };
 };
}
function showInventoryNotice(text,open){
 notify(text,{group:'inventory',action:{label:'Ver estoque',run:open}});
}
export function stopInventoryAlerts(){monitor?.stop();monitor=null;openNotification=null;clearNotices('inventory');}
