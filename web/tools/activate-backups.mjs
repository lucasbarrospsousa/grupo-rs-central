import {readFile,writeFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {privatePath,createPool,connectionOptions} from '../backend/database.mjs';
import {BackupDrive} from '../backend/backup-drive.mjs';
import {runBackup} from '../backend/backup-runner.mjs';
const google=JSON.parse(await readFile(privatePath('backup-google.json'),'utf8'));
if(google.email!=='lucasbarrospereira13@gmail.com')throw Error('Wrong backup account');
const db=JSON.parse(await readFile(privatePath('backup-db.json'),'utf8')),key=(await readFile(privatePath('backup-key.txt'),'utf8')).trim(),token=(await readFile(privatePath('backup-token.txt'),'utf8')).trim();
const admin=createPool({admin:true}),drive=new BackupDrive(google),pool=new pg.Pool({...connectionOptions({admin:true}),...db,max:1});
try{
 const before=(await admin.query('select * from central_homologacao.backup_control where id')).rows[0];let folder=before.folder_id;
 if(!folder){const created=await drive.createFolder();folder=created.id;await admin.query('update central_homologacao.backup_control set folder_id=$1 where id',[folder]);}
 await drive.health(folder);
 const config={google,db};await writeFile(privatePath('backup-config.json'),JSON.stringify(config),{mode:0o600});
 const access=(await readFile(privatePath('supabase-access-token.txt'),'utf8')).trim(),base='https://api.supabase.com/v1/projects/vwiayytzmorcjeaszowg';
 const secrets=await fetch(base+'/secrets',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify([{name:'CENTRAL_BACKUP_CONFIG',value:JSON.stringify(config)},{name:'CENTRAL_BACKUP_KEY',value:key},{name:'CENTRAL_BACKUP_TOKEN',value:token}]),signal:AbortSignal.timeout(30000)});if(!secrets.ok)throw Error('Backup secret deployment failed: '+secrets.status);
 const form=new FormData();form.set('metadata',JSON.stringify({name:'central-backup',entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([await readFile(new URL('../.sites-runtime/backup/index.ts',import.meta.url))],{type:'application/typescript'}),'index.ts');
 const deployed=await fetch(base+'/functions/deploy?slug=central-backup',{method:'POST',headers:{Authorization:'Bearer '+access},body:form,signal:AbortSignal.timeout(120000)});if(!deployed.ok)throw Error('Backup worker deployment failed: '+deployed.status);
 await admin.query("update central_homologacao.backup_control set enabled=true,state='ready',last_error=null,next_run_at=now() where id");
 // First full run uses the same cloud worker that the schedule will call.
 const response=await fetch('https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-backup',{method:'POST',headers:{'x-central-backup':token},signal:AbortSignal.timeout(150000)});
 const result=await response.json();if(!response.ok||!result.ok)throw Error('First cloud backup failed: '+(result.error||response.status));
 const existing=(await admin.query("select id from vault.secrets where name='central_backup_token'")).rows[0];if(existing)await admin.query('select vault.update_secret($1,$2)',[existing.id,token]);else await admin.query('select vault.create_secret($1,$2,$3)',[token,'central_backup_token','Private daily Central database backup']);
 await admin.query(`CREATE OR REPLACE FUNCTION central_homologacao.dispatch_backup() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-backup',headers:=jsonb_build_object('Content-Type','application/json','x-central-backup',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_backup_token')),body:='{}'::jsonb,timeout_milliseconds:=150000) $$;REVOKE ALL ON FUNCTION central_homologacao.dispatch_backup() FROM PUBLIC,anon,authenticated,central_homologacao_web,central_backup;`);
 // Hourly dispatcher provides bounded recovery after transient failures; successful copies run daily.
 await admin.query("select cron.schedule('central-drive-backup','17 * * * *','select central_homologacao.dispatch_backup()')");
 const status=(await admin.query('select enabled,state,last_success_at,next_run_at,drive from central_homologacao.backup_control where id')).rows[0];
 console.log(JSON.stringify({firstCloudBackup:result,status,folderUrl:'https://drive.google.com/drive/folders/'+folder}));
}finally{await admin.end();await pool.end();}
