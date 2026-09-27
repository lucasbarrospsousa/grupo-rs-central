// This is a browser request budget, not the provider's billing meter.
export const LIMITS = Object.freeze({hour:120,day:1000});
export function createBudget({read=()=>null,write=()=>{},now=Date.now,limits=LIMITS}={}) {
 let fallback={events:[],paused:false},storageFailed=false;
 function state(){let value;try{if(!storageFailed)value=JSON.parse(read()||'null');}catch{storageFailed=true;}
  if(!value||!Array.isArray(value.events))value=fallback;
  const at=now();return {paused:value.paused===true,events:value.events.filter(e=>e&&Number.isFinite(e.at)&&Number.isInteger(e.cost)&&e.cost>0&&e.at>at-86400000&&e.at<=at)};
 }
 function save(s){fallback=s;try{if(!storageFailed)write(JSON.stringify(s));}catch{storageFailed=true;}}
 function snapshot(){const s=state(),at=now();return {...s,hour:s.events.filter(e=>e.at>at-3600000).reduce((n,e)=>n+e.cost,0),day:s.events.reduce((n,e)=>n+e.cost,0),limits};}
 return {snapshot,pause(value){const s=state();s.paused=!!value;save(s);},claim(cost=1){const s=snapshot();if(!Number.isInteger(cost)||cost<1||s.paused||s.hour+cost>limits.hour||s.day+cost>limits.day)return false;save({paused:s.paused,events:[...s.events,{at:now(),cost}]});return true;}};
}
export function retryDelay(interval,failures){return Math.min(1800000,interval*2**Math.min(5,Math.max(0,failures)));}
const KEY='sinderacode:auto-reads:v1';let shared;
function budget(){return shared??=createBudget({read:()=>localStorage.getItem(KEY),write:s=>localStorage.setItem(KEY,s)});}
function changed(){globalThis.dispatchEvent?.(new Event('usage-control-change'));}
// Only optional background reads belong here. Initial reads and user actions bypass it.
export function startEconomyPolling(task,{interval=120000,cost=1,active=()=>true,alive=()=>true}={}){
 let stopped=false,busy=false,failures=0,next=Date.now()+interval;
 async function run(){
  if(stopped||busy||Date.now()<next||document.hidden||navigator.onLine===false||!active())return;
  busy=true;
  try{
   const claim=()=>budget().claim(typeof cost==='function'?cost():cost);
   const admitted=navigator.locks?await navigator.locks.request(KEY,claim):claim();changed();
   if(stopped||document.hidden||navigator.onLine===false||!active())return;
   if(!admitted){next=Date.now()+60000;return;}
   let ok=false;try{ok=(await task())!==false;}catch{}
   failures=ok?0:failures+1;next=Date.now()+retryDelay(interval,failures);
  }catch{failures++;next=Date.now()+retryDelay(interval,failures);}finally{busy=false;}
 }
 const timer=setInterval(()=>{if(!alive()){stop();return;}void run();},10000);
 const visible=()=>{if(!document.hidden)void run();};document.addEventListener('visibilitychange',visible);
 function stop(){stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);}
 return stop;
}
export function mountUsageControl(){
 if(document.querySelector('#usage-control'))return ()=>{};
 const panel=document.createElement('details');panel.id='usage-control';
 panel.style.cssText='position:fixed;bottom:8px;right:12px;z-index:40;background:#fff;color:#153954;border:1px solid #bad3e7;border-radius:12px;padding:9px 13px;box-shadow:0 3px 14px #1233;font:13px system-ui;max-width:min(370px,90vw)';
 panel.innerHTML='<summary style="cursor:pointer;font-weight:650">Consumo econômico</summary><div style="padding-top:10px"><p data-usage-state></p><p data-usage-count></p><p>Leituras periódicas dos painéis pausam em abas ocultas e recuam após falhas. Atualizar manualmente, gravar e autenticar continuam disponíveis.</p><p><b>Este contador é local.</b> Não mede GB, banco, logs ou tarefas do servidor. A cota oficial é compartilhada conforme a organização no provedor.</p><button type="button" data-usage-pause style="padding:8px;border:1px solid #bad3e7;border-radius:8px;background:#eef6ff;color:#153954;cursor:pointer"></button><p><a href="https://supabase.com/dashboard/organizations" target="_blank" rel="noopener noreferrer">Conferir cota oficial no Supabase ↗</a></p></div>';
 const paint=()=>{const s=budget().snapshot(),limited=s.hour>=s.limits.hour||s.day>=s.limits.day;panel.querySelector('summary').textContent=s.paused||limited?'Consultas automáticas pausadas':'Consumo econômico ativo';panel.querySelector('[data-usage-state]').textContent=s.paused?'Pausa manual neste navegador.':limited?'Teto local atingido. As leituras retomam quando houver saldo na janela móvel.':'Proteção das leituras periódicas ativa.';panel.querySelector('[data-usage-count]').textContent=`Reservas de leituras automáticas: ${s.hour}/${s.limits.hour} na última hora · ${s.day}/${s.limits.day} nas últimas 24 horas. Compartilhadas entre abas deste site; não incluem ações manuais.`;panel.querySelector('[data-usage-pause]').textContent=s.paused?'Retomar consultas automáticas':'Pausar consultas automáticas';};
 panel.querySelector('[data-usage-pause]').onclick=()=>{budget().pause(!budget().snapshot().paused);changed();};
 document.body.append(panel);paint();globalThis.addEventListener('usage-control-change',paint);globalThis.addEventListener('storage',paint);const timer=setInterval(paint,60000);
 return()=>{panel.remove();clearInterval(timer);globalThis.removeEventListener('usage-control-change',paint);globalThis.removeEventListener('storage',paint);};
}
