// Only the current page is queued. Started requests finish, but stale results do
// not redraw a different page. A failed request is throttled like a successful one.
export function visibleStockQueue({query,onResult,onProgress=()=>{},now=Date.now,ttl=60000,concurrency=2}){
 let targets=[],closed=false;const active=new Set(),attempts=new Map();
 function pump(){
  if(closed)return;
  for(const id of targets){
   if(active.size>=concurrency)break;
   if(active.has(id)||now()-(attempts.get(id)??-Infinity)<ttl)continue;
   attempts.set(id,now());active.add(id);onProgress();
   Promise.resolve().then(()=>query(id)).then(data=>{if(!closed&&targets.includes(id))onResult(id,data);},error=>{if(!closed&&targets.includes(id))onResult(id,{error:error.message});}).finally(()=>{attempts.set(id,now());active.delete(id);if(!closed){onProgress();pump();}});
  }
 }
 return{set(ids,force=false){targets=[...new Set(ids)].slice(0,10);if(force)for(const id of targets)if(!active.has(id))attempts.delete(id);pump();},close(){closed=true;targets=[];},pending(){return targets.filter(id=>active.has(id)||!attempts.has(id)).length;}};
}
