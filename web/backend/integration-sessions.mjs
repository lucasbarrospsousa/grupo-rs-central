import {createHash} from 'node:crypto';

// Share authentication only within this backend/pool, never cached query results
// or per-batch guards. A new runtime deliberately starts with empty sessions.
const stores=new WeakMap();
export function integrationSessions(pool){
 if(!stores.has(pool))stores.set(pool,{api:new Map(),web:new Map()});
 return stores.get(pool);
}
export class CredentialSessions{
 constructor(entries,credentials){this.entries=entries;this.credentials=credentials;}
 fingerprint(key){return createHash('sha256').update(JSON.stringify(this.credentials(key))).digest('hex');}
 get(key){const entry=this.entries.get(key);if(!entry)return undefined;if(entry.fingerprint!==this.fingerprint(key)){this.entries.delete(key);return undefined;}return entry.value;}
 set(key,value){this.entries.set(key,{fingerprint:this.fingerprint(key),value});return this;}
 delete(key){return this.entries.delete(key);}
}
