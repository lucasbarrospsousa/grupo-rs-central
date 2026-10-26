// Explicit one-off migration: read-only source; encrypted destination only.
import {readFile,writeFile} from 'node:fs/promises';
import {createPool} from '../web/backend/database.mjs';
import {userAccess} from '../web/backend/user-access.mjs';
import {encryptUsers,decryptUsers,randomToken} from './auth-crypto.mjs';
import {driveConnection} from './drive.mjs';
const root=new URL('../.secrets/homologacao/',import.meta.url),configPath=new URL('parallel-drive.json',root);
const config=JSON.parse(await readFile(configPath,'utf8'));await driveConnection(config);
let key;try{key=(await readFile(new URL('parallel-auth-key.txt',root),'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;key=randomToken();await writeFile(new URL('parallel-auth-key.txt',root),key,{mode:0o600,flag:'wx'});}
const pool=createPool(),c=await pool.connect();const users=[];
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const rows=(await c.query("select id,username,password_hash,active from central_homologacao.users where username not like 'service-%' order by username")).rows;
 for(const row of rows){const branches=(await c.query('select b.id,b.name,m.role from central_homologacao.memberships m join central_homologacao.branches b on b.id=m.branch_id where m.user_id=$1 order by b.id',[row.id])).rows;const permissions=await userAccess(c,{user_id:row.id,username:row.username});users.push({...row,branches,permissions});}
 await c.query('ROLLBACK');
}finally{c.release();await pool.end();}
if(!users.some(u=>u.active&&u.permissions.owner))throw Error('No active owner copied');
const payload={schemaVersion:1,copiedAt:new Date().toISOString(),users};
const encrypted=await encryptUsers(payload,key);
const t=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'})});const token=await t.json();if(!t.ok||!token.access_token)throw Error('OAuth failed');
const boundary='auth_'+crypto.randomUUID(),meta={name:'usuarios-protegidos-'+payload.copiedAt.replaceAll(':','-')+'.enc.json',parents:[config.folder_id],mimeType:'application/json',appProperties:{centralParallel:'auth-v1'}};
const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'multipart/related; boundary='+boundary},body:`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(encrypted)}\r\n--${boundary}--`});if(!r.ok)throw Error('Encrypted upload failed');const file=await r.json();
const back=await fetch('https://www.googleapis.com/drive/v3/files/'+file.id+'?alt=media',{headers:{Authorization:'Bearer '+token.access_token}});if(!back.ok||JSON.stringify(await decryptUsers(await back.json(),key))!==JSON.stringify(payload))throw Error('Encrypted readback failed');
await writeFile(configPath,JSON.stringify({...config,auth_file_id:file.id}),{mode:0o600});
console.log(JSON.stringify({copied:users.length,active:users.filter(u=>u.active).length,encrypted:true,permissionsPreserved:true,sourceWrites:0}));
