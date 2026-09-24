import {Buffer} from 'node:buffer';
import {MAX_BYTES,sha256} from './backup-snapshot.mjs';
export const BACKUP_TAG='grupo-rs-central-v2';
export class BackupError extends Error {constructor(code){super(code);this.code=code;}}
export class BackupDrive {
 constructor(config,{fetcher=fetch}={}){this.config=config;this.fetcher=fetcher;this.token=null;}
 async access(){
  if(this.token)return this.token;
  const {client_id,client_secret,refresh_token}=this.config;
  const r=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  const data=await r.json();if(!r.ok||!data.access_token)throw new BackupError(['invalid_grant','invalid_client','unauthorized_client'].includes(data.error)?'GOOGLE_RECONNECT':'GOOGLE_UNAVAILABLE');
  return this.token=data.access_token;
 }
 async request(path,{method='GET',body,headers={},raw=false,retry=true,upload=false}={}){
  const r=await this.fetcher('https://www.googleapis.com/'+(upload?'upload/drive/v3/':'drive/v3/')+path,{method,headers:{Authorization:'Bearer '+await this.access(),...headers},body,signal:AbortSignal.timeout(25000)});
  if(r.status===401&&retry){this.token=null;return this.request(path,{method,body,headers,raw,retry:false,upload});}
  if(!r.ok){let reason='';try{reason=(await r.json()).error?.errors?.[0]?.reason||'';}catch{}
   const limited=['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded'].includes(reason);
   throw new BackupError(r.status===401?'GOOGLE_RECONNECT':reason==='storageQuotaExceeded'?'DRIVE_FULL':limited?'GOOGLE_UNAVAILABLE':r.status===403?'DRIVE_PERMISSION':r.status===404?'DRIVE_FOLDER_MISSING':'GOOGLE_UNAVAILABLE');}
  if(raw){if(Number(r.headers.get('content-length')||0)>MAX_BYTES)throw new BackupError('BACKUP_TOO_LARGE');const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>MAX_BYTES)throw new BackupError('BACKUP_TOO_LARGE');return bytes;}
  return r.status===204?null:r.json();
 }
 async health(folderId){
  const about=await this.request('about?fields=user(emailAddress),storageQuota');
  if(about.user?.emailAddress?.toLowerCase()!==this.config.email.toLowerCase())throw new BackupError('DRIVE_ACCOUNT_MISMATCH');
  const folder=await this.request('files/'+encodeURIComponent(folderId)+'?fields=id,mimeType,trashed,ownedByMe,shared,capabilities(canAddChildren)');
  if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||!folder.ownedByMe||folder.shared||!folder.capabilities?.canAddChildren)throw new BackupError('DRIVE_FOLDER_PRIVATE');
  const files=await this.list(folderId),quota=about.storageQuota||{};
  return {account:about.user.emailAddress,limit:quota.limit==null?null:Number(quota.limit),usage:quota.usage==null?null:Number(quota.usage),drive_usage:quota.usageInDrive==null?null:Number(quota.usageInDrive),backup_count:files.filter(f=>f.appProperties?.verified==='true').length,backup_bytes:files.filter(f=>f.appProperties?.verified==='true').reduce((s,f)=>s+Number(f.size||0),0),files};
 }
 async list(folderId){
  if(!/^[a-zA-Z0-9_-]+$/.test(folderId))throw new BackupError('DRIVE_FOLDER_MISSING');
  const files=[];let pageToken;
  do{const q=new URLSearchParams({q:`'${folderId}' in parents and trashed = false and appProperties has { key='centralBackup' and value='${BACKUP_TAG}' }`,pageSize:'100',fields:'nextPageToken,files(id,name,size,createdTime,appProperties,parents)',orderBy:'createdTime desc',...(pageToken?{pageToken}:{})});
   const page=await this.request('files?'+q);files.push(...(page.files||[]));pageToken=page.nextPageToken;if(files.length>3000)throw new BackupError('DRIVE_LIST_LIMIT');
  }while(pageToken);return files;
 }
 async createFolder(){
  const about=await this.request('about?fields=user(emailAddress)');
  if(about.user?.emailAddress?.toLowerCase()!==this.config.email.toLowerCase())throw new BackupError('DRIVE_ACCOUNT_MISMATCH');
  return this.request('files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Grupo RS Central — Backups privados',mimeType:'application/vnd.google-apps.folder',appProperties:{centralBackup:BACKUP_TAG}})});
 }
 async upload(folderId,runId,bytes){
  const boundary='central_'+runId.replaceAll('-',''),meta={name:'Central-'+new Date().toISOString().replaceAll(':','-')+'-'+runId+'.grsc.enc',parents:[folderId],appProperties:{centralBackup:BACKUP_TAG,runId,sha256:sha256(bytes),verified:'false'}};
  const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
  return this.request('files?uploadType=multipart&fields=id,size,appProperties',{method:'POST',upload:true,headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 }
 download(id){return this.request('files/'+encodeURIComponent(id)+'?alt=media',{raw:true});}
 async markVerified(id){return this.request('files/'+encodeURIComponent(id)+'?fields=id',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:{verified:'true'}})});}
 async retain(folderId,now=Date.now()){
  const files=await this.list(folderId),verified=files.filter(x=>x.appProperties?.verified==='true').sort((a,b)=>Date.parse(b.createdTime)-Date.parse(a.createdTime));
  // Only this app's verified copies, older than 30 days. Always retain newest two.
  const expired=verified.slice(2).filter(x=>Date.parse(x.createdTime)<now-30*86400000);
  for(const file of expired)await this.request('files/'+encodeURIComponent(file.id),{method:'DELETE'});
  return expired.length;
 }
}
