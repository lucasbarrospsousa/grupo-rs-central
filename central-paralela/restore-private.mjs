// Restore into NEW private files only. Never replaces production configuration.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {connect} from './drive.mjs';import {restoreBackup} from './backup-crypto.mjs';import {digest,decryptUsers} from './auth-crypto.mjs';
const root=new URL('../.secrets/homologacao/',import.meta.url),dirs=(await readdir(new URL('parallel-backups/',root))).sort(),dir=new URL('parallel-backups/'+dirs.at(-1)+'/',root);
const key=(await readFile(new URL('parallel-auth-key.txt',root),'utf8')).trim(),payload=await restoreBackup(JSON.parse(await readFile(new URL('backup.enc.json',dir),'utf8')),key),config=payload.config;
await connect(config);await decryptUsers(payload.documents[config.auth_file_id],key);
const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'})}),token=await response.json();if(!response.ok||!token.access_token)throw Error('OAuth unavailable');
const request=async(path,opts={})=>{const r=await fetch('https://www.googleapis.com/'+path,{...opts,headers:{Authorization:'Bearer '+token.access_token,...opts.headers},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Restore HTTP '+r.status);return r.json();};
const ids={};
for(const [old,data]of Object.entries(payload.documents)){
 const boundary='restore_'+crypto.randomUUID(),body=`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:'restore-check-'+Date.now()+'.json',parents:[config.folder_id],mimeType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
 const file=await request('upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 const meta=await request('drive/v3/files/'+file.id+'?fields=parents,shared,trashed');if(meta.shared||meta.trashed||!meta.parents.includes(config.folder_id))throw Error('Restored file privacy mismatch');
 const back=await request('drive/v3/files/'+file.id+'?alt=media');if(digest(JSON.stringify(back))!==digest(JSON.stringify(data)))throw Error('Restored data mismatch');ids[old]=file.id;
}
const restored={...config,auth_file_id:ids[config.auth_file_id],tracking:Object.fromEntries(Object.entries(config.tracking).map(([k,v])=>[k,ids[v]])),snapshots:Object.fromEntries(Object.entries(config.snapshots).map(([k,v])=>[k,ids[v]]))};
await writeFile(new URL('restore-config.private.json',dir),JSON.stringify(restored),{mode:0o600});
await writeFile(new URL('restore-verified.json',dir),JSON.stringify({at:new Date().toISOString(),documents:Object.keys(ids).length,activated:false,ids}),{mode:0o600});
console.log(JSON.stringify({restoredDocuments:Object.keys(ids).length,readbackVerified:true,private:true,activated:false,providerCalls:0}));
