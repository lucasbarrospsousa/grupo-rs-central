// Explicit operator setup only. Never imported by the public Worker.
import {readFile,writeFile} from 'node:fs/promises';
import {driveConnection} from './drive.mjs';
const root=new URL('../.secrets/homologacao/',import.meta.url);
const config=JSON.parse(await readFile(new URL('backup-google.json',root),'utf8'));
const expected=process.env.DRIVE_EXPECTED_ACCOUNT?.trim().toLowerCase();
if(!expected)throw Error('Set DRIVE_EXPECTED_ACCOUNT explicitly');
if(config.email?.toLowerCase()!==expected)throw Error('Wrong configured account');
const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'})});
const token=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token)throw Error('Google authorization must be renewed');
async function call(path,method='GET',data,upload=false){const r=await fetch('https://www.googleapis.com/'+(upload?'upload/':'')+'drive/v3/'+path,{method,headers:{Authorization:'Bearer '+token.access_token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Drive operation failed HTTP '+r.status);return r.json();}
const about=await call('about?fields=user(emailAddress)');if(about.user?.emailAddress?.toLowerCase()!==expected)throw Error('Wrong live Google account');
const query=new URLSearchParams({q:"trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='centralParallel' and value='storage-v1' }",fields:'files(id,name)',pageSize:'10'});
const folders=(await call('files?'+query)).files||[];if(folders.length>1)throw Error('Ambiguous storage folders');
const folder=folders[0]||await call('files?fields=id,name','POST',{name:'Grupo RS Central — Projeto paralelo',mimeType:'application/vnd.google-apps.folder',appProperties:{centralParallel:'storage-v1'}});
const target={client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,email:expected,folder_id:folder.id};
await driveConnection(target);
const probe=await call('files?fields=id','POST',{name:'verificacao-conexao-temporaria.json',mimeType:'application/json',parents:[folder.id],appProperties:{centralParallel:'test-only'}});
const content={project:'central-paralela',synthetic:true,nonce:crypto.randomUUID()};
let verified=false;
try{await call('files/'+probe.id+'?uploadType=media','PATCH',content,true);const result=await call('files/'+probe.id+'?alt=media');if(result.nonce!==content.nonce)throw Error('Readback mismatch');verified=true;}
finally{await call('files/'+probe.id,'PATCH',{trashed:true});}
const removed=await call('files/'+probe.id+'?fields=trashed');if(!removed.trashed)throw Error('Test cleanup failed');
await writeFile(new URL('parallel-drive.json',root),JSON.stringify(target),{mode:0o600});
console.log(JSON.stringify({account:expected,folder:folder.name,folderId:folder.id,private:true,writeReadVerified:verified,testFileTrashed:true}));
