// Server-only adapter; no caller-supplied folder or file IDs.
export async function driveConnection(config, fetcher=fetch) {
  if(!config?.client_id||!config.client_secret||!config.refresh_token||!config.folder_id||!config.email)throw Error('DRIVE_NOT_CONFIGURED');
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  const token=await response.json();if(!response.ok||!token.access_token)throw Error('DRIVE_RECONNECT');
  async function read(path){const r=await fetcher('https://www.googleapis.com/drive/v3/'+path,{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('DRIVE_UNAVAILABLE');return r.json();}
  const account=await read('about?fields=user(emailAddress)');
  if(account.user?.emailAddress?.toLowerCase()!==config.email.toLowerCase())throw Error('DRIVE_ACCOUNT_MISMATCH');
  const folder=await read('files/'+encodeURIComponent(config.folder_id)+'?fields=id,name,mimeType,trashed,ownedByMe,shared,capabilities(canAddChildren)');
  if(folder.mimeType!=='application/vnd.google-apps.folder'||folder.trashed||folder.shared||!folder.ownedByMe||!folder.capabilities?.canAddChildren)throw Error('DRIVE_FOLDER_NOT_PRIVATE');
  return {connected:true,folder:folder.name,storage:'Google Drive',database:'Banco atual da Central',checkedAt:new Date().toISOString()};
}
