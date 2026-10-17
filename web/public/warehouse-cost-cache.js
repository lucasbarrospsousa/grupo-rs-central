const snapshots=new WeakMap(),requests=new WeakMap();
export function cachedWarehouseCosts(repo){
 const cached=snapshots.get(repo);
 return repo.real&&repo.user?.permissions?.owner&&cached?.username===repo.user?.username?cached.data:null;
}
export async function loadWarehouseCosts(repo,{refresh=false}={}){
 if(!repo.real||!repo.user?.permissions?.owner)return null;
 if(refresh)repo.costRevision=(repo.costRevision||0)+1;
 const username=repo.user.username,cached=cachedWarehouseCosts(repo),pending=requests.get(repo);
 if(pending?.username===username)return pending.promise;
 if(cached&&!refresh)return cached;
 const promise=(async()=>{
  const data=await repo.request('warehouse-costs?branch=imperatriz&view=summary',refresh?{method:'POST'}:{});
  if(data.ok!==true||!Array.isArray(data.items))throw Error('Valores não confirmados.');
  if(repo.user?.username===username&&repo.user?.permissions?.owner)snapshots.set(repo,{username,data});
  return data;
 })();
 requests.set(repo,{username,promise});
 try{return await promise;}finally{if(requests.get(repo)?.promise===promise)requests.delete(repo);}
}
