const ttl=300000;
const key=(branch,row,scope)=>JSON.stringify([scope,branch,row.id,row.serial,row.version??null,row.status,row.plate||'',row.client||'']);
export function dischargeCache(repo){
 const scope=JSON.stringify([repo.user?.user_id,repo.user?.id,repo.user?.username]);
 const cache=repo.dischargeAnalysisCache||(repo.dischargeAnalysisCache=new Map());
 return{
  get(branch,row,now=Date.now()){const id=key(branch,row,scope),entry=cache.get(id);if(!entry||now-entry.at>=ttl){cache.delete(id);return null;}return structuredClone(entry.result);},
  set(branch,row,result,now=Date.now()){if(!result||!['stock','review','eligible'].includes(result.category)||result.category==='eligible'&&!result.ok)return;for(const [id,e] of cache)if(now-e.at>=ttl)cache.delete(id);if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(key(branch,row,scope),{at:now,result:Object.fromEntries(['plate','client','association_confirmed','ok','category','message'].filter(k=>result[k]!==undefined).map(k=>[k,structuredClone(result[k])]))});},
  clear(branch,row){cache.delete(key(branch,row,scope));}
 };
}
