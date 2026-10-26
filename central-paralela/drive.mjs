// Server-only adapter; no caller-supplied folder or file IDs.
async function connect(config, fetcher=fetch) {
  if(!config?.client_id||!config.client_secret||!config.refresh_token||!config.folder_id||!config.email)throw Error('DRIVE_NOT_CONFIGURED');
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  const token=await response.json();if(!response.ok||!token.access_token)throw Error('DRIVE_RECONNECT');
  async function read(path){const r=await fetcher('https://www.googleapis.com/drive/v3/'+path,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('DRIVE_UNAVAILABLE');return r.json();}
  const account=await read('about?fields=user(emailAddress)');
  if(account.user?.emailAddress?.toLowerCase()!==config.email.toLowerCase())throw Error('DRIVE_ACCOUNT_MISMATCH');
  const folder=await read('files/'+encodeURIComponent(config.folder_id)+'?fields=id,name,mimeType,trashed,ownedByMe,shared,capabilities(canAddChildren)');
  if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||folder.shared||!folder.ownedByMe||!folder.capabilities?.canAddChildren)throw Error('DRIVE_FOLDER_NOT_PRIVATE');
  return {read,folder};
}
export async function driveConnection(config,fetcher=fetch){const {folder}=await connect(config,fetcher);return {connected:true,folder:folder.name,storage:'Google Drive',database:'Banco atual da Central',checkedAt:new Date().toISOString()};}
export async function driveDashboard(config,branch,fetcher=fetch){
  const id=config?.snapshots?.[branch];if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('SNAPSHOT_MISSING');
  const {read}=await connect(config,fetcher);
  const meta=await read('files/'+id+'?fields=parents,shared,trashed,size');
  if(meta.shared||meta.trashed||!meta.parents?.includes(config.folder_id)||Number(meta.size)>1048576)throw Error('SNAPSHOT_INVALID');
  const data=await read('files/'+id+'?alt=media');
  if(data.schemaVersion!==1||data.branch?.id!==branch||!Number.isFinite(Date.parse(data.copiedAt))||!Number.isInteger(data.total)||!Array.isArray(data.statuses)||!Array.isArray(data.carriers))throw Error('SNAPSHOT_INVALID');
  return {...data,source:'Google Drive',snapshot:true};
}
