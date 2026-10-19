const states=new WeakMap();
export function maintenanceState(repo){let s=states.get(repo);if(!s||s.user!==repo.user){s={user:repo.user,cache:new Map(),pending:new Map(),listeners:new Set()};states.set(repo,s);}return s;}
export async function loadMaintenance(repo,base,mode='saved'){
 const s=maintenanceState(repo),cached=s.cache.get(base);
 if(mode==='saved'&&cached&&Date.now()-cached.at<3600000)return cached.data;
 if(s.pending.has(base))return s.pending.get(base);
 const flight=(async()=>{const data=await repo.request('integrations/maintenance?branch='+encodeURIComponent(base)+(mode==='force'?'&refresh=1':mode==='automatic'?'&automatic=1':'&saved=1'));
 if(repo.user!==s.user)throw Error('Sessão alterada.');
 if(!data.pending){s.cache.set(base,{data,at:Date.now()});for(const listener of s.listeners)listener();}
 return data;})();s.pending.set(base,flight);
 try{return await flight;}finally{if(s.pending.get(base)===flight)s.pending.delete(base);}
}
export function startMaintenanceRefresh(repo,{setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,read=loadMaintenance}={}){
 repo.stopMaintenanceRefresh?.();const user=repo.user,epoch=repo.epoch;
 if(!user||!(user.permissions?.owner||['overview','maintenance'].every(v=>user.permissions?.views?.includes(v))))return;
 let stopped=false,timer;const valid=()=>!stopped&&repo.user===user&&repo.epoch===epoch;
 const stop=()=>{stopped=true;clearTimer(timer);};repo.stopMaintenanceRefresh=stop;
 const run=async()=>{if(!valid())return;const started=now();try{for(const base of user.branches){if(!valid())break;try{await read(repo,base.id,'automatic');}catch{}}}finally{if(valid())timer=setTimer(run,Math.max(0,3600000-(now()-started)));}};
 timer=setTimer(run,60000);return stop;
}
