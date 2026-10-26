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
  return {read,folder,async writeTracking(id,data){
   const response=await fetcher('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media',{method:'PATCH',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error('DRIVE_SAVE_FAILED');
  }};
}
export async function driveConnection(config,fetcher=fetch){const {folder}=await connect(config,fetcher);return {connected:true,folder:folder.name,storage:'Google Drive',database:'Arquivos privados do projeto paralelo',checkedAt:new Date().toISOString()};}
export async function driveUsers(config,fetcher=fetch){
 const id=config?.auth_file_id;if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('AUTH_NOT_CONFIGURED');
 const {read}=await connect(config,fetcher);
 const meta=await read('files/'+id+'?fields=parents,shared,trashed,size');
 if(meta.shared||meta.trashed||!meta.parents?.includes(config.folder_id)||Number(meta.size)>3000000)throw Error('AUTH_FILE_NOT_PRIVATE');
 return read('files/'+id+'?alt=media');
}
async function readDashboard(config,branch,read){
  const id=config?.snapshots?.[branch];if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('SNAPSHOT_MISSING');

  const meta=await read('files/'+id+'?fields=parents,shared,trashed,size');
  if(meta.shared||meta.trashed||!meta.parents?.includes(config.folder_id)||Number(meta.size)>1048576)throw Error('SNAPSHOT_INVALID');
  const data=await read('files/'+id+'?alt=media');
  if(data.schemaVersion!==1||data.branch?.id!==branch||!Number.isFinite(Date.parse(data.copiedAt))||!Number.isInteger(data.total)||!Array.isArray(data.statuses)||!Array.isArray(data.carriers))throw Error('SNAPSHOT_INVALID');
  return {...data,source:'Google Drive',snapshot:true};
}

export async function driveDashboards(config,branches,fetcher=fetch){if(!branches.length)return [];if(branches.every(b=>config?.tracking?.[b]))return (await driveTracking(config,branches,fetcher)).map(trackingDashboard);const {read}=await connect(config,fetcher);return Promise.all([...new Set(branches)].map(branch=>readDashboard(config,branch,read)));}
export async function driveDashboard(config,branch,fetcher=fetch){return (await driveDashboards(config,[branch],fetcher))[0];}

export async function driveTracking(config,branches,fetcher=fetch){
 if(!branches.length)return [];const {read}=await connect(config,fetcher);
 return Promise.all([...new Set(branches)].map(async branch=>{
 const id=config?.tracking?.[branch];if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('TRACKING_MISSING');
 const meta=await read('files/'+id+'?fields=parents,shared,trashed,size');if(meta.shared||meta.trashed||!meta.parents?.includes(config.folder_id)||Number(meta.size)>12000000)throw Error('TRACKING_PRIVATE');
 const data=await read('files/'+id+'?alt=media');if(data.schemaVersion!==1||data.kind!=='tracking'||data.branch?.id!==branch||!Number.isFinite(Date.parse(data.copiedAt))||!Array.isArray(data.rows)||data.rows.length>20000)throw Error('TRACKING_INVALID');
 return {schemaVersion:1,branch:data.branch,copiedAt:data.copiedAt,source:'Google Drive',total:data.rows.filter(r=>!r.deleted_at).length,rows:data.rows.filter(r=>!r.deleted_at).map(r=>Object.fromEntries(['id','serial','identification','plate','model','carrier','status','installed_at','connectivity','checked_at','live','version','created_at','updated_at','phone','iccid','apn','owner_binding'].map(k=>[k,r[k]??null])))};
 }));
}

// Only the single Operations object may call this writer. Original SQL is never touched.
export async function trackingDocument(config,branch,fetcher=fetch){
 const id=config?.tracking?.[branch];if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('TRACKING_MISSING');
 const connection=await connect(config,fetcher),meta=await connection.read('files/'+id+'?fields=parents,shared,trashed,size');
 if(meta.shared||meta.trashed||!meta.parents?.includes(config.folder_id)||Number(meta.size)>12000000)throw Error('TRACKING_PRIVATE');
 const data=await connection.read('files/'+id+'?alt=media');
 if(data.schemaVersion!==1||data.kind!=='tracking'||data.branch?.id!==branch||!Array.isArray(data.rows)||data.rows.length>20000)throw Error('TRACKING_INVALID');
 return {data,save:()=>{if(new TextEncoder().encode(JSON.stringify(data)).length>12000000)throw Error('TRACKING_LIMIT');return connection.writeTracking(id,data);}};
}

export function trackingDashboard(snapshot){const rows=snapshot.rows;const group=key=>{const m=new Map();for(const r of rows){const value=r[key]||'Não informado';m.set(value,(m.get(value)||0)+1);}return [...m].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);};return {schemaVersion:1,branch:snapshot.branch,copiedAt:snapshot.copiedAt,total:rows.length,statuses:group('status'),carriers:group('carrier'),models:group('model'),source:'Google Drive',snapshot:true};}
