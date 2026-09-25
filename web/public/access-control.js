export const IDLE_MS=2*60*60*1000;
export const isReader=(user,branch,route)=>user?.permissions?(user.permissions.owner?false:!user.permissions.writes.includes(route)):user?.branches?.find(b=>b.id===branch)?.role==='reader';
export const restrictedRoute=route=>['link','bulk','settings'].includes(route);
const writes='[data-edit],[data-delete],[data-remove],[data-discharge],#stock-new,#stock-analyze,#stock-batch,#visits-new,#visit-edit,#warehouse-new';
export function accessControl(repo){
 let deadline=0,username='',lastSent=0,busy=false;
 const expire=()=>{if(!repo.user)return;repo.user=null;document.querySelector('#modal')?.close();location.reload();};
 const apply=()=>{
  if(repo.user?.permissions){document.querySelectorAll('[data-nav],[data-route]').forEach(e=>{const r=e.dataset.nav||e.dataset.route;if(r==='users'?!repo.user.permissions.owner:!repo.user.permissions.views.includes(r))e.hidden=true;});if(!repo.user.permissions.owner&&!repo.user.permissions.writes.includes('sms'))document.querySelectorAll('[data-sms]').forEach(e=>{e.hidden=true;});}
  if(!document.body.classList.contains('read-only'))return;
  document.querySelectorAll(writes).forEach(e=>{e.hidden=true;});
  document.querySelectorAll('button').forEach(e=>{if(e.closest('.sms-composer')&&repo.user?.permissions?.writes.includes('sms'))return;if(/^(novo |nova |editar|excluir|remover|dar baixa|aplicar baixa|analisar baixa|revisar envio|revisar vinculação|enviar selecionados|enviar mensagem|salvar)/i.test(e.textContent.trim()))e.hidden=true;});
  document.querySelectorAll('[data-vehicle-plate]').forEach(e=>{e.readOnly=true;});
 };
 new MutationObserver(apply).observe(document.querySelector('#app'),{childList:true,subtree:true});
 new MutationObserver(apply).observe(document.querySelector('#modal'),{childList:true,subtree:true});
 const initialize=()=>{if(repo.user&&username!==repo.user.username){username=repo.user.username;deadline=new Date(repo.user.lastActivityAt).getTime()+IDLE_MS;}if(!repo.user){username='';deadline=0;}};
 const key=()=> 'central-activity:'+username;
 const activity=async e=>{
  initialize();if(!repo.user||!e.isTrusted)return;
  if(Date.now()>=deadline)return expire();
  if(busy||Date.now()-lastSent<30000)return;
  busy=true;lastSent=Date.now();try{const result=await repo.request('activity',{method:'POST'});deadline=Date.parse(result.lastActivityAt)+IDLE_MS;try{localStorage.setItem(key(),String(deadline));}catch{}}catch(error){if(error.status===401)expire();}finally{busy=false;}
 };
 for(const event of ['pointerdown','pointermove','keydown','wheel','touchstart'])window.addEventListener(event,activity,{passive:true});
 window.addEventListener('storage',e=>{if(e.key===key()&&Number(e.newValue)>deadline)deadline=Number(e.newValue);});
 window.addEventListener('central-session-expired',expire);
 const check=()=>{initialize();if(repo.user&&Date.now()>=deadline)expire();};
 setInterval(check,1000);document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
}
