// Local-only durable snapshots. No credentials; never used before server session validation.
export class IndexedSnapshots {
 constructor(factory=globalThis.indexedDB){this.factory=factory;this.opening=null;}
 open(){return this.opening??=new Promise((resolve,reject)=>{const r=this.factory.open('central-snapshots-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('snapshots');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Cache ocupado'));});}
 async transaction(mode,fn){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots',mode);let result;try{result=fn(tx.objectStore('snapshots'));}catch(e){tx.abort();reject(e);return;}tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Cache cancelado'));});}
 get(key){return this.transaction('readonly',s=>s.get(key));}
 put(key,value,valid=()=>true){return this.transaction('readwrite',s=>{if(valid())s.put(value,key);});}
 remove(key){return this.transaction('readwrite',s=>s.delete(key));}
 clear(){return this.transaction('readwrite',s=>s.clear());}
 async retain(key){return this.transaction('readwrite',s=>{const r=s.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(c.key!==key)c.delete();c.continue();}};});}
}
