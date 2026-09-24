import test from 'node:test';import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptBackup,decryptBackup,canonical} from '../backend/backup-snapshot.mjs';
import {BackupDrive,BACKUP_TAG} from '../backend/backup-drive.mjs';
import {backupHealth,backupCard} from '../public/backup-card.js';
import {runBackup} from '../backend/backup-runner.mjs';
const sample={format:2,schema:'central_homologacao',tables:{devices:[{serial:'000123',data:{iccid:'89550000000000000001',nested:{a:1,b:2}}}]},definitions:{columns:[]}};
test('authenticated encryption preserves nested data and zeros; wrong key, corruption and truncation fail',()=>{
 const key=randomBytes(32).toString('hex'),bytes=encryptBackup(sample,key);assert.deepEqual(decryptBackup(bytes,key),sample);assert.notDeepEqual(encryptBackup(sample,key),bytes);
 assert.throws(()=>decryptBackup(bytes,randomBytes(32).toString('hex')));const bad=Buffer.from(bytes);bad[bad.length-1]^=1;assert.throws(()=>decryptBackup(bad,key));assert.throws(()=>decryptBackup(bytes.subarray(0,30),key));
 assert.equal(bytes.includes(Buffer.from('895500')),false);assert.notEqual(canonical({data:{a:1}}),canonical({data:{a:2}}));
});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('rate limits remain retryable while permission refusals block access',async()=>{
 for(const [reason,expected] of [['rateLimitExceeded','GOOGLE_UNAVAILABLE'],['userRateLimitExceeded','GOOGLE_UNAVAILABLE'],['insufficientPermissions','DRIVE_PERMISSION']]){
  const drive=new BackupDrive({},{fetcher:async()=>json({error:{errors:[{reason}]}},403)});drive.token='test';
  await assert.rejects(drive.request('about'),new RegExp(expected));
 }
});
test('folder creation refuses a different account before any write',async()=>{
 const drive=new BackupDrive({email:'owner@example.com'}),methods=[];
 drive.request=async(path,args={})=>{methods.push(args.method||'GET');return {user:{emailAddress:'wrong@example.com'}};};
 await assert.rejects(drive.createFolder(),/DRIVE_ACCOUNT_MISMATCH/);assert.deepEqual(methods,['GET']);
});
test('Google rejects revoked access once without token retry loop',async()=>{
 let calls=0;const drive=new BackupDrive({client_id:'id',client_secret:'secret',refresh_token:'revoked'},{fetcher:async()=>{calls++;return json({error:'invalid_grant'},400);}});
 await assert.rejects(drive.access(),/GOOGLE_RECONNECT/);assert.equal(calls,1);
});
test('expired access token renews once; repeated 401 stops',async()=>{
 let tokens=0,requests=0;const drive=new BackupDrive({client_id:'id',client_secret:'secret',refresh_token:'token'},{fetcher:async(url)=>url.includes('oauth2')?(tokens++,json({access_token:'new'})):(requests++,json({},401))});
 await assert.rejects(drive.request('about'),/GOOGLE_RECONNECT/);assert.equal(tokens,2);assert.equal(requests,2);
});
test('health blocks wrong Google account and shared destination',async()=>{
 const drive=new BackupDrive({email:'owner@example.com'});drive.request=async()=>({user:{emailAddress:'wrong@example.com'}});await assert.rejects(drive.health('folder'),/DRIVE_ACCOUNT_MISMATCH/);
 drive.request=async p=>p.startsWith('about')?{user:{emailAddress:'owner@example.com'}}:{mimeType:'application/vnd.google-apps.folder',shared:true,ownedByMe:true,capabilities:{canAddChildren:true}};
 await assert.rejects(drive.health('folder'),/DRIVE_FOLDER_PRIVATE/);
});
test('pagination inventories only tagged files inside exact folder',async()=>{
 const paths=[],drive=new BackupDrive({});drive.request=async p=>{paths.push(p);return paths.length===1?{files:[{id:'a'}],nextPageToken:'next'}:{files:[{id:'b'}]};};
 assert.equal((await drive.list('folder_123')).length,2);const first=new URLSearchParams(paths[0].split('?')[1]);assert.match(first.get('q'),/folder_123/);assert.match(first.get('q'),new RegExp(BACKUP_TAG));assert.match(paths[1],/pageToken=next/);
});
test('retention keeps at least two verified backups and never touches unverified files',async()=>{
 const drive=new BackupDrive({}),removed=[];drive.list=async()=>['a','b','c','unverified'].map(id=>({id,createdTime:'2020-01-01',appProperties:{verified:id==='unverified'?'false':'true'}}));drive.request=async(path,args)=>removed.push([path,args.method]);
 assert.equal(await drive.retain('folder'),1);assert.deepEqual(removed,[['files/c','DELETE']]);
});
test('dashboard distinguishes pending, outdated, stale health, blocked, low quota, unknown quota and failure',()=>{
 const now=Date.now(),s={enabled:true,state:'ready',last_success_at:new Date(now).toISOString(),drive_checked_at:new Date(now).toISOString(),drive:{limit:100,usage:10}};
 assert.equal(backupHealth(null,now).label,'Aguardando conexão');assert.equal(backupHealth(s,now).tone,'healthy');assert.equal(backupHealth({...s,state:'blocked'},now).tone,'danger');
 assert.equal(backupHealth(s,now+27*3600000).label,'Backup atrasado');assert.equal(backupHealth({...s,drive:{limit:100,usage:91}},now).tone,'warning');assert.equal(backupHealth({...s,state:'failed'},now).tone,'danger');
 assert.match(backupCard({...s,drive:{}}),/Não consultado/);assert.doesNotMatch(backupCard({...s,account_email:'<script>'}),/<script>/);assert.equal(backupHealth({...s,drive_checked_at:null},now).label,'Drive não conferido');
});
function fakePool(){let leased=false;const calls=[];const c={release(){},async query(sql,params=[]){calls.push({sql,params});if(sql.startsWith('update central_homologacao.backup_control set lease=')){if(leased)return{rowCount:0,rows:[]};leased=true;return{rowCount:1,rows:[{folder_id:'folder'}]};}if(sql.startsWith('select enabled'))return{rows:[{enabled:true,state:'running'}]};return{rowCount:1,rows:[]};}};return{calls,connect:async()=>c};}
test('a cloud run downloads and validates before retention; concurrent run skips',async()=>{
 const pool=fakePool(),steps=[];let uploaded;const drive={health:async()=>({limit:1e9,usage:0,files:[],backup_count:1}),upload:async(f,id,b)=>{steps.push('upload');uploaded=b;return{id:'file'};},download:async()=>{steps.push('download');return uploaded;},markVerified:async()=>steps.push('verified'),retain:async()=>steps.push('retention')};
 const args={drive,key:randomBytes(32).toString('hex'),snapshotter:async()=>sample,restore:async(c,s)=>{assert.deepEqual(s,sample);steps.push('restore');return {tables:1,rows:1};}};
 const [a,b]=await Promise.all([runBackup(pool,args),runBackup(pool,args)]);assert.equal(a.ok,true);assert.equal(b.skipped,true);assert.deepEqual(steps,['upload','download','restore','verified','retention']);assert.equal(pool.calls.filter(x=>x.sql.includes("values($1,'running')")).length,1);
});
test('corrupted Drive download cannot mark success or expire previous backups',async()=>{
 const pool=fakePool();let retained=false,verified=false;
 const drive={health:async()=>({limit:1e9,usage:0}),upload:async()=>({id:'file'}),download:async()=>Buffer.from('corrupted'),markVerified:async()=>{verified=true;},retain:async()=>{retained=true;}};
 const r=await runBackup(pool,{drive,key:randomBytes(32).toString('hex'),snapshotter:async()=>sample});assert.equal(r.error,'BACKUP_DOWNLOAD_MISMATCH');assert.equal(verified,false);assert.equal(retained,false);assert.ok(pool.calls.some(x=>x.params.includes('BACKUP_DOWNLOAD_MISMATCH')));
});
test('revoked Google authorization persists a blocked state, preserving prior success',async()=>{
 const pool=fakePool(),drive={health:async()=>{throw Error('GOOGLE_RECONNECT');}};const r=await runBackup(pool,{drive});assert.equal(r.ok,false);assert.ok(pool.calls.some(x=>x.params.includes('blocked')));assert.equal(pool.calls.some(x=>x.sql.includes('last_success_at=')),false);
});
