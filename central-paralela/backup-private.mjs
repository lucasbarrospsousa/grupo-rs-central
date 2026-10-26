// Explicit private backup. Never include its output in source control.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {connect} from './drive.mjs';
import {encryptUsers,decryptUsers,digest} from './auth-crypto.mjs';
const root=new URL('../.secrets/homologacao/',import.meta.url);
const config=JSON.parse(await readFile(new URL('parallel-drive.json',root),'utf8'));
const key=(await readFile(new URL('parallel-auth-key.txt',root),'utf8')).trim();
const connection=await connect(config),documents={};
const ids=[...new Set([config.auth_file_id,...Object.values(config.tracking||{}),...Object.values(config.snapshots||{})])];
for(const id of ids){
 if(!/^[\w-]+$/.test(id||''))throw Error('Invalid file');
 const meta=await connection.read('files/'+id+'?fields=parents,shared,trashed,size');
 if(meta.shared||meta.trashed||!meta.parents?.includes(config.folder_id)||Number(meta.size)>12000000)throw Error('Private file validation failed');
 documents[id]=await connection.read('files/'+id+'?alt=media');
}
const payload={schemaVersion:1,users:[],createdAt:new Date().toISOString(),config,documents};
const encrypted=await encryptUsers(payload,key);
// decryptUsers has a users-file bound: backup restoration uses independently sized envelopes.
const {Buffer}=await import('node:buffer');
const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(encrypted.iv,'base64'),additionalData:new TextEncoder().encode('central-paralela-users-v1')},await crypto.subtle.importKey('raw',Buffer.from(key,'hex'),'AES-GCM',false,['decrypt']),Buffer.from(encrypted.ciphertext,'base64'));
const restored=JSON.parse(new TextDecoder().decode(bytes));
if(digest(JSON.stringify(restored))!==digest(JSON.stringify(payload)))throw Error('Restore mismatch');
await decryptUsers(restored.documents[config.auth_file_id],key);
const dir=new URL('parallel-backups/'+Date.now()+'/',root);await mkdir(dir,{recursive:true});
const serialized=JSON.stringify(encrypted);await writeFile(new URL('backup.enc.json',dir),serialized,{flag:'wx',mode:0o600});
if(digest(await readFile(new URL('backup.enc.json',dir),'utf8'))!==digest(serialized))throw Error('Disk readback mismatch');
const report={createdAt:payload.createdAt,documents:ids.length,sha256:digest(serialized),restoreInMemory:true,sourceWrites:0,providerCalls:0,tracking:Object.entries(config.tracking||{}).map(([branch,id])=>{const d=documents[id];return {branch,devices:d.rows?.length||0,maintenance:d.maintenance?.length||0,warehouse:d.warehouse?.rows?.length||0,gatewayPaired:!!d.gateway?.token_hash,gatewayLastSeen:d.gateway?.last_seen||null,testDeviceFound:d.rows?.some(r=>r.serial==='024270394'&&!r.deleted_at)||false};})};
await writeFile(new URL('manifest.json',dir),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify(report));
