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
function budget(){return shared??=createBudget({limits:effectiveLimits,read:()=>localStorage.getItem(KEY),write:s=>localStorage.setItem(KEY,s)});}
function changed(){globalThis.dispatchEvent?.(new Event('usage-control-change'));}
// Only optional background reads belong here. Initial reads and user actions bypass it.
export function startEconomyPolling(task,{interval=120000,cost=1,active=()=>true,alive=()=>true}={}){
 void syncPolicy(); let stopped=false,busy=false,failures=0,lastRun=Date.now(),next=lastRun+interval*effectiveFactor;
 async function run(){
  if(stopped||busy||Date.now()<next||document.hidden||navigator.onLine===false||!active())return;
  busy=true;
  try{
   await syncPolicy();if(Date.now()<lastRun+interval*effectiveFactor)return;
   const claim=()=>budget().claim(typeof cost==='function'?cost():cost);
   const admitted=navigator.locks?await navigator.locks.request(KEY,claim):claim();changed();
   if(stopped||document.hidden||navigator.onLine===false||!active())return;
   if(!admitted){next=Date.now()+60000;return;}
   let ok=false;try{ok=(await task())!==false;}catch{}
   lastRun=Date.now();failures=ok?0:failures+1;next=Date.now()+retryDelay(interval*effectiveFactor,failures);
  }catch{failures++;next=Date.now()+retryDelay(interval*effectiveFactor,failures);}finally{busy=false;}
 }
 const timer=setInterval(()=>{if(!alive()){stop();return;}void run();},10000);
 const visible=()=>{if(!document.hidden)void run();};document.addEventListener('visibilitychange',visible);
 function stop(){stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);}
 return stop;
}

const effectiveLimits={hour:90,day:700};let effectiveFactor=2,lastPolicy=0,policyFlight=null;
const portal='https://portal-sidera-code.lucasbarrosp.chatgpt.site/api/economy';
const systems={'grupo-rs-central.lucasbarrosp.chatgpt.site':'central','sos-vendas-web.lucasbarrosp.chatgpt.site':'vendas','sos-24horas.lucasbarrosp.chatgpt.site':'24horas'};
export function validPolicy(p,now=Date.now()){return !!p&&['normal','economy','restricted','essential'].includes(p.mode)&&Number.isFinite(p.factor)&&p.factor>=1&&p.factor<=10&&Number.isInteger(p.hour)&&p.hour>=1&&p.hour<=120&&Number.isInteger(p.day)&&p.day>=1&&p.day<=1000&&Number.isFinite(p.validUntil)&&p.validUntil>now&&p.validUntil<=now+3600000;}
async function syncPolicy(){
 if(policyFlight)return policyFlight;if(Date.now()-lastPolicy<900000)return;
 const system=systems[globalThis.location?.hostname];if(!system)return;
 policyFlight=(async()=>{try{const r=await fetch(portal+'?system='+system,{credentials:'omit',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Unavailable');const p=await r.json();if(!validPolicy(p))throw Error('Invalid policy');effectiveLimits.hour=p.hour;effectiveLimits.day=p.day;effectiveFactor=p.factor;}catch{effectiveLimits.hour=90;effectiveLimits.day=700;effectiveFactor=2;}finally{lastPolicy=Date.now();policyFlight=null;}})();return policyFlight;
}
// Compatibility entry point: administration now lives only in Portal Sinderacode.
export function mountUsageControl(){document.querySelector('#usage-control')?.remove();budget().pause(false);void syncPolicy();return()=>{};}
