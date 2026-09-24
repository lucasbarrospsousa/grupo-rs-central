import {randomUUID} from 'node:crypto';
import {takeSnapshot,encryptBackup,decryptBackup,verifyRestore,sha256} from './backup-snapshot.mjs';
import {BackupDrive} from './backup-drive.mjs';
const AUTH_ERRORS=new Set(['GOOGLE_RECONNECT','DRIVE_PERMISSION','DRIVE_ACCOUNT_MISMATCH','DRIVE_FOLDER_PRIVATE','DRIVE_FOLDER_MISSING']);
const KNOWN=new Set([...AUTH_ERRORS,'DRIVE_FULL','GOOGLE_UNAVAILABLE','BACKUP_TOO_LARGE','BACKUP_RESTORE_MISMATCH','BACKUP_KEY_INVALID','BACKUP_DOWNLOAD_MISMATCH','DRIVE_LIST_LIMIT']);
export function backupError(e){return KNOWN.has(e.code||e.message)?e.code||e.message:'BACKUP_FAILED';}
export const publicDrive=h=>Object.fromEntries(Object.entries(h).filter(([k])=>k!=='files'));
export async function runBackup(pool,{config,key,migrations={},drive=new BackupDrive(config),force=false,snapshotter=takeSnapshot,restore=verifyRestore}={}){
 const c=await pool.connect(),id=randomUUID();let claimed=false;
 try{
  // Atomic persistent lease also prevents separate Edge instances from overlapping.
  const claim=await c.query(`update central_homologacao.backup_control set lease=$1,lease_until=now()+interval '15 minutes',state='running',last_attempt_at=now() where id and enabled and state<>'blocked' and (lease_until is null or lease_until<now()) and ($2 or next_run_at is null or next_run_at<=now()) returning folder_id`,[id,force]);
  if(!claim.rowCount){
   const current=(await c.query('select enabled,state,folder_id,drive_checked_at from central_homologacao.backup_control where id')).rows[0];
   if(current?.enabled&&!['blocked','running'].includes(current.state)&&current.folder_id&&(!current.drive_checked_at||Date.now()-new Date(current.drive_checked_at).getTime()>45*60000)){
    try{const health=publicDrive(await drive.health(current.folder_id));await c.query("update central_homologacao.backup_control set drive=$1,drive_checked_at=now(),last_error=case when state='ready' and last_error in ('GOOGLE_UNAVAILABLE','DRIVE_HEALTH_PENDING') then null else last_error end where id",[health]);}
    catch(e){const code=backupError(e);await c.query("update central_homologacao.backup_control set last_error=$1,state=case when $2 then 'blocked' else state end where id",[code,AUTH_ERRORS.has(code)]);return {ok:false,error:code};}
   }
   return {skipped:true};
  }claimed=true;const folder=claim.rows[0].folder_id;
  await c.query("update central_homologacao.backup_runs set state='failed',finished_at=now(),error_code='INTERRUPTED' where state='running' and started_at<now()-interval '15 minutes'");
  await c.query("insert into central_homologacao.backup_runs(id,state) values($1,'running')",[id]);
  const before=await drive.health(folder);await c.query('update central_homologacao.backup_control set drive=$1,drive_checked_at=now() where id',[publicDrive(before)]);
  const snapshot=await snapshotter(c,migrations),bytes=encryptBackup(snapshot,key);
  if(before.limit!=null&&before.usage!=null&&before.limit-before.usage<bytes.length+1048576)throw Error('DRIVE_FULL');
  const file=await drive.upload(folder,id,bytes);
  await c.query('update central_homologacao.backup_runs set file_id=$2,bytes=$3,sha256=$4 where id=$1',[id,file.id,bytes.length,sha256(bytes)]);
  // Validation uses the bytes downloaded from Drive, not the local upload buffer.
  const downloaded=await drive.download(file.id);if(sha256(downloaded)!==sha256(bytes))throw Error('BACKUP_DOWNLOAD_MISMATCH');
  const counts=await restore(c,decryptBackup(downloaded,key));
  await drive.markVerified(file.id);
  await c.query("update central_homologacao.backup_runs set state='verified',finished_at=now(),tables_count=$2,rows_count=$3,restore_verified=true where id=$1",[id,counts.tables,counts.rows]);
  // Retention runs only after this run has uploaded, downloaded and restored successfully.
  let warning=null;try{await drive.retain(folder);}catch(e){warning='RETENTION_PENDING';}
  let health;try{health=publicDrive(await drive.health(folder));}catch{health=null;warning=warning||'DRIVE_HEALTH_PENDING';}
  await c.query(`update central_homologacao.backup_control set state='ready',lease=null,lease_until=null,last_success_at=now(),last_error=$2,next_run_at=(date_trunc('day',now() at time zone 'UTC')+interval '1 day 5 hours 17 minutes') at time zone 'UTC',drive=coalesce($3::jsonb,drive),drive_checked_at=case when $3::jsonb is null then drive_checked_at else now() end where id and lease=$1`,[id,warning,health]);
  return {ok:true,...counts,bytes:bytes.length,restoreVerified:true,warning};
 }catch(e){
  if(claimed){const code=backupError(e);await c.query('ROLLBACK');
   await c.query("update central_homologacao.backup_runs set state='failed',finished_at=now(),error_code=$2 where id=$1 and state='running'",[id,code]);
   await c.query(`update central_homologacao.backup_control set state=$2,last_error=$3,lease=null,lease_until=null,next_run_at=now()+interval '1 hour' where id and lease=$1`,[id,AUTH_ERRORS.has(code)?'blocked':'failed',code]);
  }
  return {ok:false,error:backupError(e)};
 }finally{c.release();}
}
