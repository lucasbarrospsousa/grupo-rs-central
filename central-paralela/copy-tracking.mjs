// One-off authorized copy. Source SQL is read-only; no vendor integrations.
import {readFile,writeFile} from 'node:fs/promises';
import {createPool} from '../web/backend/database.mjs';
import {driveConnection} from './drive.mjs';
const file=new URL('../.secrets/homologacao/parallel-drive.json',import.meta.url),config=JSON.parse(await readFile(file,'utf8'));
await driveConnection(config);
const pool=createPool(),c=await pool.connect(),snapshots=[];let sqlMs;
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const owner=(await c.query("select id from central_homologacao.users where username='lucasabm' and active")).rows[0];if(!owner)throw Error('Active owner missing');
 await c.query("select set_config('central.user_id',$1,true)",[owner.id]);
 const branches=(await c.query('select b.id,b.name from central_homologacao.branches b join central_homologacao.memberships m on m.branch_id=b.id where m.user_id=$1 and m.role=$2 order by b.id',[owner.id,'admin'])).rows;
 const start=performance.now(),copiedAt=new Date().toISOString();
 for(const branch of branches){
  const rows=(await c.query(`select d.id,d.serial,d.data->>'identification' identification,d.data->>'plate' plate,d.data->>'model' model,d.data->>'carrier' carrier,d.data->>'status' status,d.data->>'installed_at' installed_at,case when o.data->'chip'->>'ok'='true' then o.data->'chip'->>'connectivity' else null end connectivity,o.checked_at from central_homologacao.devices d left join central_homologacao.device_observations o on o.device_id=d.id where d.branch_id=$1 and d.deleted_at is null order by d.serial`,[branch.id])).rows;
  snapshots.push({schemaVersion:1,kind:'tracking',copiedAt,branch,rows,total:rows.length});
 }
 sqlMs=Math.round(performance.now()-start);await c.query('ROLLBACK');
}finally{c.release();await pool.end();}
const t=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'})});
const token=await t.json();if(!t.ok||!token.access_token)throw Error('OAuth failed');
async function request(path,options={}){const r=await fetch('https://www.googleapis.com/'+path,{...options,headers:{Authorization:'Bearer '+token.access_token,...options.headers},signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('Drive HTTP '+r.status);return r.json();}
const next={...config,tracking:{...config.tracking}},created=[];
for(const snapshot of snapshots){
 const boundary='snapshot_'+crypto.randomUUID();const metadata={name:'tracking-'+snapshot.branch.id+'-'+snapshot.copiedAt.replaceAll(':','-')+'.json',parents:[config.folder_id],mimeType:'application/json',appProperties:{centralParallel:'tracking-v1',branch:snapshot.branch.id}};
 const body=`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(snapshot)}\r\n--${boundary}--`;
 const saved=await request('upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 next.tracking[snapshot.branch.id]=saved.id;created.push(saved.id);
 const back=await request('drive/v3/files/'+saved.id+'?alt=media');if(JSON.stringify(back)!==JSON.stringify(snapshot))throw Error('Snapshot readback mismatch');
}
await writeFile(file,JSON.stringify(next),{mode:0o600});
const metrics=[];
const result={copiedAt:snapshots[0]?.copiedAt,branches:snapshots.map(s=>({id:s.branch.id,total:s.total})),sqlAggregateAllBranchesMs:sqlMs,driveValidatedSingleBranchMs:metrics,sourceWrites:0,providerCalls:0};
await writeFile(new URL('../.secrets/homologacao/parallel-tracking-result.json',import.meta.url),JSON.stringify(result),{mode:0o600});console.log(JSON.stringify(result));
