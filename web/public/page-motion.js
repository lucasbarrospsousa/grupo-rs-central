// Shared presentation only: no extra requests, data changes or artificial delay.
export const motionSurfaces='article,.panel,.metric,.branch-card,.stock-card,.link-panel,.bulk-panel,.bulk-stats>article,.consult-panel,.warehouse-stat,.warehouse-card,.sms-stat,.sms-panel,.settings-api,.settings-panel,.health-card,.visit-card,.visit-metric,.vehicle-details>div,.login-brand,.login-main,tbody';
export function motionRequestKind(path){
 const u=new URL(path,'https://central.invalid/'),p=u.pathname.replace(/^\//,'');
 if(['session','activity','ui-event','logout'].includes(p)||p.startsWith('logs'))return 'quiet';
 if(/^integrations\/(stock|sync-status)$/.test(p))return 'quiet';
 if(/^integrations\/(health|maintenance|operations|gateway)$/.test(p)||p==='backups/status')return 'initial';
 return 'foreground';
}
export function installPageMotion(repo){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),states=new WeakMap(),active=new Set();let frame=0,lastIntent=-Infinity;
 const currentRoot=()=>document.querySelector('#modal[open]')||document.querySelector('#page')||document.querySelector('.login');
 const stateFor=root=>{if(!states.has(root))states.set(root,{seen:new Set(),revealed:new WeakSet(),reads:new Set(),pending:0,timer:0,failed:false});return states.get(root);};
 const excluded=root=>root.matches('#page')&&!!root.querySelector('.system-logs')||root.matches('#modal')&&!!root.querySelector('.log-detail');
 function reveal(root){
  if(!root?.isConnected||excluded(root))return;
  const state=stateFor(root),surfaces=[...root.querySelectorAll(motionSurfaces)].filter(el=>!el.closest('.leaflet-container'));
  for(const el of surfaces)if(el.tagName!=='TBODY')el.classList.add('central-motion-surface');
  const nodes=surfaces.filter(el=>!el.querySelector(motionSurfaces));
  let order=0;
  nodes.forEach((el,index)=>{
   if(el.tagName!=='TBODY')el.classList.add('central-motion-surface');
   if((state.pending&&!root.querySelector('.live-overview'))||el.closest('[aria-busy="true"]')||!el.getClientRects().length)return;
   // Stable slots suppress replay when polling replaces the same cards/rows.
   const identity=el.id||(el.dataset.stockBase?'stock:'+el.dataset.stockBase:el.dataset.base?'base:'+el.dataset.base:'');
   const key=identity|| (el.tagName+':'+[...el.classList].filter(c=>c!=='central-motion-surface').sort().join('.'))+':'+index;
   if(state.revealed.has(el)||state.seen.has(key))return;state.revealed.add(el);state.seen.add(key);
   if(reduced.matches||order>=32)return;
   const animation=el.animate([{opacity:0,translate:'0 18px',scale:'.98'},{opacity:1,translate:'0 0',scale:'1'}],{duration:520,delay:Math.min(order++*65,260),easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
   active.add(animation);animation.finished.catch(()=>{}).finally(()=>active.delete(animation));
  });
 }
 function scan(){frame=0;reveal(document.querySelector('#page'));reveal(document.querySelector('.login'));reveal(document.querySelector('#modal[open]'));}
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(scan);};
 const observer=new MutationObserver(records=>{
  for(const r of records)if(r.target.id==='modal'&&r.attributeName==='open')states.delete(r.target);
  schedule();
 });
 for(const node of [document.querySelector('#app'),document.querySelector('#modal')])if(node)observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy','open']});
 // Clicks identify explicit requests; they never reset already visible cards.
 const intent=e=>{
  if(!e.isTrusted||!e.target.closest('#page,#modal,.login'))return;
  if(e.type==='input'&&!e.target.matches('input[type=search],input[id*=query],input[id*=search]'))return;
  lastIntent=performance.now();
 };
 for(const type of ['click','change','submit','input'])document.addEventListener(type,intent,true);
 if(repo.real){const request=repo.request;
  repo.request=async function(path,options){
   const kind=motionRequestKind(path),root=kind==='initial'?document.querySelector('#page'):currentRoot(),state=root&&stateFor(root),manual=performance.now()-lastIntent<1200;
   const visible=!!root&&!excluded(root)&&kind!=='quiet'&&(kind!=='initial'||!state.reads.has(path)||manual);
   if(visible){state.reads.add(path);clearTimeout(state.timer);if(!state.pending)state.failed=false;state.pending++;root.setAttribute('data-motion-loading','true');schedule();}
   try{return await request.call(this,path,options);}catch(error){if(visible)state.failed=true;throw error;}
   finally{if(visible){state.pending--;if(!state.pending)state.timer=setTimeout(()=>{if(!root.isConnected||state.pending)return;root.removeAttribute('data-motion-loading');schedule();},100);}}
  };
 }
 reduced.addEventListener('change',()=>{if(reduced.matches)for(const a of active)a.cancel();});schedule();
}
