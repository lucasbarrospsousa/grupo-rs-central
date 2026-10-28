import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Buffer} from 'node:buffer';
import {projectTracking} from './drive.mjs';

// Disposable, encrypted display cache. Drive remains the authoritative store.
// A committed manifest is replaced atomically; failed publication invalidates it.
export class ReadModel {
 constructor(storage,key,scope){this.storage=storage;this.key=key;this.scope=createHash('sha256').update(scope||'').digest('hex');this.memory=new Map();}
 async publish(branch,data){
  const snapshot=projectTracking(data,{warehouse:true,maintenance:true,owner:true});
  const value={at:Date.now(),scope:this.scope,snapshot};
  this.memory.set(branch,value);
  if(!this.key)return;
  const prefix='display:'+branch;let previous;
  try{
   previous=await this.storage.get(prefix);
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(this.key,'hex'),iv);
   cipher.setAAD(Buffer.from(this.scope+':'+branch));
   const bytes=Buffer.concat([cipher.update(gzipSync(JSON.stringify(value))),cipher.final()]).toString('base64');
   if(bytes.length>10000000)throw Error('DISPLAY_LIMIT');
   const revision=randomBytes(12).toString('hex'),count=Math.ceil(bytes.length/100000),chunks={};
   for(let i=0;i<count;i++)chunks[prefix+':'+revision+':'+i]=bytes.slice(i*100000,(i+1)*100000);
   await this.storage.put(chunks);
   await this.storage.put(prefix,{revision,count,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),scope:this.scope});
  }catch{
   // Never report a successful Drive write as failed because of disposable cache.
   await this.storage.delete(prefix).catch(()=>{});
  }
  if(previous?.revision)await this.storage.delete(Array.from({length:previous.count},(_,i)=>prefix+':'+previous.revision+':'+i)).catch(()=>{});
 }
 async read(branch,options){
  let value=this.memory.get(branch);
  if(!value&&this.key){
   const prefix='display:'+branch,meta=await this.storage.get(prefix);
   if(meta?.scope===this.scope&&Number.isInteger(meta.count)&&meta.count>0&&meta.count<=100){
    try{
     const keys=Array.from({length:meta.count},(_,i)=>prefix+':'+meta.revision+':'+i),chunks=await this.storage.get(keys);
     const decipher=createDecipheriv('aes-256-gcm',Buffer.from(this.key,'hex'),Buffer.from(meta.iv,'base64'));
     decipher.setAAD(Buffer.from(this.scope+':'+branch));decipher.setAuthTag(Buffer.from(meta.tag,'base64'));
     const decoded=Buffer.concat([decipher.update(Buffer.from(keys.map(k=>{if(!chunks.has(k))throw Error('Missing chunk');return chunks.get(k);}).join(''),'base64')),decipher.final()]);
     value=JSON.parse(gunzipSync(decoded,{maxOutputLength:40000000}));
     if(value.scope!==this.scope||value.snapshot.branch.id!==branch)throw Error('Invalid scope');
     this.memory.set(branch,value);
    }catch{return null;}
   }
  }
  if(!value)return null;
  const result=structuredClone(value.snapshot);
  if(!options.maintenance)delete result.maintenance;
  if(!options.warehouse)delete result.warehouse;
  else if(!options.owner&&result.warehouse)result.warehouse.costs=null;
  if(options.stock===false)result.rows=[];
  return {...result,cachedAt:new Date(value.at).toISOString()};
 }
}
