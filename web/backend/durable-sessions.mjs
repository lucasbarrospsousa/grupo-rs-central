import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';
const states=new WeakMap();
const ttl=15*60*1000;
export function sessionCipher(secret){
 const key=createHash('sha256').update('central-integration-sessions-v1:'+secret).digest();
 return {
  seal(value,context=''){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(context));const data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');},
  open(value,context=''){const b=Buffer.from(value,'base64'),c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAAD(Buffer.from(context));c.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([c.update(b.subarray(28)),c.final()]).toString());}
 };
}
// Only authentication material. No responses, records, credentials or promises.
function snapshot(store){
 const result=new Map();
 for(const kind of ['api','web'])for(const [name,e] of store[kind]){
  const v=e.value;if(!v||!Number.isFinite(v.at)||Date.now()-v.at>=ttl)continue;
  result.set(kind+':'+name,{fingerprint:e.fingerprint,value:{at:v.at,token:v.token||'',ready:!!v.ready,cookies:[...(v.cookies||[])],generation:v.generation||0}});
 }
 return result;
}
export function durableIntegrations(pool,store,service,{secret=process.env.CENTRAL_SYNC_TOKEN,now=Date.now}={}){
 if(!secret)return service; // Local/offline execution retains the existing memory-only behavior.
 if(!states.has(store))states.set(store,{loaded:false,loading:null,saved:new Map()});
 const state=states.get(store),cipher=sessionCipher(secret);
 async function load(){
  if(state.loaded)return;
  state.loading??=(async()=>{
   const {rows}=await pool.query('select session_key,payload from central_homologacao.integration_session_cache where expires_at>now()');
   for(const row of rows)try{
    const e=cipher.open(row.payload,row.session_key),split=row.session_key.indexOf(':'),kind=row.session_key.slice(0,split),name=row.session_key.slice(split+1);
    if(!['api','web'].includes(kind)||!e.value||now()-e.value.at>=ttl)continue;
    if(!store[kind].has(name))store[kind].set(name,{fingerprint:e.fingerprint,value:{...e.value,cookies:new Map(e.value.cookies)}});
    state.saved.set(row.session_key,JSON.stringify(e));
   }catch{/* A rotated key or corrupt cache must never become an authentication. */}
   state.loaded=true;
  })().finally(()=>{state.loading=null;});
  await state.loading;
 }
 async function save(){
  for(const [key,e] of snapshot(store)){
   const plain=JSON.stringify(e);if(state.saved.get(key)===plain)continue;
   await pool.query(`insert into central_homologacao.integration_session_cache(session_key,payload,issued_at,expires_at)
    values($1,$2,$3::timestamptz,$3::timestamptz+interval '15 minutes')
    on conflict(session_key) do update set payload=excluded.payload,issued_at=excluded.issued_at,expires_at=excluded.expires_at
    where integration_session_cache.issued_at<=excluded.issued_at`,[key,cipher.seal(e,key),new Date(e.value.at).toISOString()]);
   state.saved.set(key,plain);
  }
 }
 return new Proxy(service,{get(target,name){
  const fn=target[name];
  if(typeof fn!=='function'||['secrets','credentials','request'].includes(name))return fn;
  return async(...args)=>{await load().catch(()=>{});try{return await fn.apply(target,args);}finally{await save().catch(()=>{});}};
 }});
}
