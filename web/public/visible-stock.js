// Query only visible rows; cancel obsolete work and reject late responses.
export function visibleStockQueue({query,onResult,onProgress=()=>{},now=Date.now,ttl=60000,concurrency=1}){
 let targets=[],closed=false;const active=new Map(),attempts=new Map();
 function cancel(id,controller){active.delete(id);attempts.delete(id);controller.abort();}
 function pump(){
  if(closed)return;
  for(const id of targets){
   if(active.size>=concurrency)break;
   if(active.has(id)||now()-(attempts.get(id)??-Infinity)<ttl)continue;
   const controller=new AbortController();attempts.set(id,now());active.set(id,controller);onProgress();
   const current=()=>!closed&&!controller.signal.aborted&&active.get(id)===controller&&targets.includes(id);
   Promise.resolve().then(()=>{if(!controller.signal.aborted)return query(id,controller.signal);}).then(data=>{if(current())onResult(id,data);},error=>{if(current())onResult(id,{error:error.message});}).finally(()=>{if(active.get(id)!==controller)return;attempts.set(id,now());active.delete(id);if(!closed){onProgress();pump();}});
  }
 }
 return{set(ids,force=false){targets=[...new Set(ids)].slice(0,10);for(const [id,controller] of active)if(!targets.includes(id))cancel(id,controller);if(force)for(const id of targets)if(!active.has(id))attempts.delete(id);pump();},close(){closed=true;targets=[];for(const [id,controller] of active)cancel(id,controller);},pending(){return targets.filter(id=>active.has(id)||!attempts.has(id)).length;}};
}
