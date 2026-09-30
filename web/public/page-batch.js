// A page is one request; obsolete responses never update the next page.
export function pageBatch({query,onStart,onResult,onError=()=>{}}){let key='',controller=null,closed=false;return{
 async run(ids,{force=false}={}){if(closed||!ids.length)return;const next=ids.join(',');if(next===key&&!force)return;if(controller&&next===key)return;controller?.abort();key=next;const current=new AbortController();controller=current;onStart(ids);try{const result=await query(ids,current.signal);if(!closed&&controller===current&&!current.signal.aborted)onResult(result,ids);}catch(e){if(!closed&&controller===current&&!current.signal.aborted)onError(e,ids);}finally{if(controller===current)controller=null;}},
 invalidate(){controller?.abort();controller=null;key='';},
 close(){closed=true;controller?.abort();controller=null;},pending(){return !!controller;}
};}
