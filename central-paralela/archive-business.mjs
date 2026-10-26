// Private preservation, not runtime import: never replays old SMS/jobs/sessions.
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createPool} from '../web/backend/database.mjs';
import {encryptUsers,digest} from './auth-crypto.mjs';import {connect} from './drive.mjs';
const root=new URL('../.secrets/homologacao/',import.meta.url),config=JSON.parse(await readFile(new URL('parallel-drive.json',root),'utf8')),key=(await readFile(new URL('parallel-auth-key.txt',root),'utf8')).trim();
await connect(config);
const pool=createPool(),c=await pool.connect(),archive={schemaVersion:1,users:[],at:new Date().toISOString(),tables:{},unavailable:[]};
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const owner=(await c.query("select id from central_homologacao.users where username='lucasabm' and active")).rows[0];if(!owner)throw Error('Owner missing');
 await c.query("select set_config('central.user_id',$1,true)",[owner.id]);
 for(const name of ['audit_events','battery_history','equipment_swaps','remote_operations','system_logs','users','link_targets']){
  if(!(await c.query("select has_table_privilege($1,'SELECT') allowed",['central_homologacao.'+name])).rows[0].allowed){archive.unavailable.push(name);continue;}
  archive.tables[name]=(await c.query('select * from central_homologacao.'+name)).rows;
 }
 await c.query('ROLLBACK');
}finally{c.release();await pool.end();}
const stamp=Date.now(),dir=new URL('parallel-archives/'+stamp+'/',root);await mkdir(dir,{recursive:true});
const migration=(await readdir(new URL('parallel-migration/',root))).sort().at(-1);
const files=[['source-business.enc.json',JSON.stringify(await encryptUsers(archive,key))],['source-inventory.enc.json',await readFile(new URL('parallel-migration/'+migration+'/source.enc.json',root),'utf8')]];
const auth=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)}),token=await auth.json();if(!auth.ok||!token.access_token)throw Error('OAuth failed');
const manifest={at:archive.at,unavailable:archive.unavailable,tables:Object.fromEntries(Object.entries(archive.tables).map(([k,v])=>[k,v.length])),files:[],providerCalls:0,sourceWrites:0};
for(const [name,body]of files){
 await writeFile(new URL(name,dir),body,{flag:'wx',mode:0o600});
 const boundary='archive_'+crypto.randomUUID(),upload=`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:stamp+'-'+name,parents:[config.folder_id],mimeType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
 const headers={Authorization:'Bearer '+token.access_token};
 const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{...headers,'Content-Type':'multipart/related; boundary='+boundary},body:upload,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Archive upload failed');const {id}=await r.json();
 const m=await fetch('https://www.googleapis.com/drive/v3/files/'+id+'?fields=parents,shared,trashed',{headers}),meta=await m.json();if(!m.ok||meta.shared||meta.trashed||!meta.parents?.includes(config.folder_id))throw Error('Archive privacy failed');
 const back=await fetch('https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',{headers});if(!back.ok||digest(await back.text())!==digest(body))throw Error('Archive readback failed');
 manifest.files.push({name,id,sha256:digest(body)});
}
await writeFile(new URL('manifest.json',dir),JSON.stringify(manifest),{flag:'wx',mode:0o600});
console.log(JSON.stringify({...manifest,files:manifest.files.map(({name,sha256})=>({name,sha256}))}));
