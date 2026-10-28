import {test} from 'node:test';import assert from 'node:assert/strict';import {driveConnection,driveDashboard,driveTracking,trackingDocument} from './drive.mjs';import worker from './worker.mjs';
const config={client_id:'test',client_secret:'secret',refresh_token:'refresh',folder_id:'folder',email:'owner@example.com'};
const folder={name:'Private',mimeType:'application/vnd.google-apps.folder',ownedByMe:true,shared:false,capabilities:{canAddChildren:true}};
function mock(overrides={}){return async url=>Response.json(url.includes('/token')?{access_token:'token'}:url.includes('/about')?{user:{emailAddress:overrides.email||config.email}}:{...folder,...overrides});}
test('private writable folder returns no secrets',async()=>{const result=await driveConnection(config,mock());assert.equal(result.connected,true);assert.equal(JSON.stringify(result).includes('secret'),false);});
test('wrong account/shared/trashed/foreign/read-only folder rejected',async()=>{for(const override of [{email:'other@example.com'},{shared:true},{trashed:true},{ownedByMe:false},{capabilities:{canAddChildren:false}}])await assert.rejects(driveConnection(config,mock(override)));});
test('missing config and revoked OAuth fail closed',async()=>{await assert.rejects(driveConnection(null));await assert.rejects(driveConnection(config,async()=>Response.json({error:'invalid_grant'},{status:400})));});
test('dashboard rejects swapped branch',async()=>{const data={schemaVersion:1,branch:{id:'a'},copiedAt:new Date().toISOString(),total:2,statuses:[],carriers:[]};const f=async url=>url.includes('/files/snapshot')?Response.json(url.includes('alt=media')?data:{parents:['folder'],size:'200',shared:false}):mock()(url);const cfg={...config,snapshots:{a:'snapshot',b:'snapshot'}};assert.equal((await driveDashboard(cfg,'a',f)).source,'Google Drive');await assert.rejects(driveDashboard(cfg,'b',f));});
test('Drive endpoints reject unauthorized sessions before Google',async()=>{const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('Forbidden external request');};try{for(const [path,user,status,expected]of [['drive-status',{},401,401],['drive-status',{permissions:{owner:false}},200,403],['dashboard?branch=denied',{permissions:{views:['overview']},branches:[{id:'allowed'}]},200,403],['dashboard?branch=allowed',{permissions:{views:[]},branches:[{id:'allowed'}]},200,403]]){const env={AUTH:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json(user,{status})})}};assert.equal((await worker.fetch(new Request('https://test.example/api/'+path),env)).status,expected);}}finally{globalThis.fetch=original;}});
test('bootstrap batches Drive reads only for authenticated authorized branches',async()=>{
 const original=globalThis.fetch;let calls=[];
 globalThis.fetch=async url=>{calls.push(url);if(url.includes('/files/snap')){const id=url.includes('snapa')?'a':'b';return Response.json(url.includes('alt=media')?{schemaVersion:1,branch:{id},copiedAt:'2026-10-26T14:44:00Z',total:1,statuses:[],carriers:[]}:{parents:['folder'],size:100,shared:false});}return mock()(url);};
 const run=async(user,status=200)=>{const env={DRIVE_CONFIG:JSON.stringify({...config,snapshots:{a:'snapa',b:'snapb'}}),AUTH:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json(user,{status,headers:{'Set-Cookie':'test-cookie'}})})}};return worker.fetch(new Request('https://test.example/api/login',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:'{}'}),env);};
 try{const r=await run({permissions:{views:['overview']},branches:[{id:'a'},{id:'b'}]});assert.equal(r.headers.get('set-cookie'),'test-cookie');assert.deepEqual((await r.json()).dashboard.map(x=>x.branch.id),['a','b']);assert.equal(calls.filter(x=>x.includes('/token')).length,1);assert.equal(calls.length,7);calls=[];await run({},401);await run({permissions:{views:[]},branches:[{id:'a'}]});assert.equal(calls.length,0);const restricted=await run({permissions:{views:['overview']},branches:[{id:'a'}]});assert.deepEqual((await restricted.json()).dashboard.map(x=>x.branch.id),['a']);assert.ok(!calls.some(x=>x.includes('snapb')));
 globalThis.fetch=async()=>{throw Error('offline');};const failed=await run({permissions:{views:['overview']},branches:[{id:'a'}]});const body=await failed.json();assert.equal(failed.status,200);assert.ok(body.dashboardError);assert.equal(body.dashboard,undefined);
 }finally{globalThis.fetch=original;}
});
test('tracking validates private files and branch, projects only approved fields',async()=>{
 const payload={schemaVersion:1,kind:'tracking',branch:{id:'a'},copiedAt:'2026-10-26T16:00:00Z',rows:[{id:'1',serial:'024000001',client:'PRIVATE MUST NOT LEAK',token:'secret',status:'Estoque'}]};
 const cfg={...config,tracking:{a:'tracking',b:'tracking'}};
 const f=async url=>url.includes('/files/tracking')?Response.json(url.includes('alt=media')?payload:{parents:['folder'],size:200,shared:false}):mock()(url);
 const rows=await driveTracking(cfg,['a'],f);assert.equal(rows[0].rows[0].serial,'024000001');assert.equal(rows[0].rows[0].client,undefined);assert.equal(rows[0].rows[0].token,undefined);await assert.rejects(driveTracking(cfg,['b'],f));await assert.rejects(driveTracking(cfg,['a'],async url=>url.includes('/files/tracking')?Response.json({parents:['folder'],shared:true}):mock()(url)));
});
test('tracking endpoint and bootstrap respect stock permission, not overview alone',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;return mock()(url);};
 const make=user=>({AUTH:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json(user)})}});
 try{for(const path of ['/api/tracking','/api/session']){const r=await worker.fetch(new Request('https://test.example'+path),make({permissions:{views:[]},branches:[{id:'a'}]}));assert.equal(r.status,path.endsWith('tracking')?403:200);if(r.status===200)assert.equal((await r.json()).tracking,undefined);}assert.equal(calls,0);const r=await worker.fetch(new Request('https://test.example/api/access'),make({username:'allowed',permissions:{views:['stock']},branches:[{id:'a'}]}));assert.equal(r.status,200);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});

test('tracking supports migrated documents above 12 MB but bounds reads and writes at 20 MB',async()=>{
 const data={schemaVersion:1,kind:'tracking',branch:{id:'a'},copiedAt:new Date().toISOString(),rows:[],padding:'x'.repeat(12000100)};
 let size=12000500,writes=0;
 const f=async(url,options)=>{if(url.includes('/upload/')){writes++;return Response.json({});}return url.includes('/files/tracking')?Response.json(url.includes('alt=media')?data:{parents:['folder'],size,shared:false}):mock()(url);};
 const cfg={...config,tracking:{a:'tracking'}};
 assert.equal((await driveTracking(cfg,['a'],f)).length,1);
 const doc=await trackingDocument(cfg,'a',f);await doc.save();assert.equal(writes,1);
 doc.data.padding='x'.repeat(20000001);await assert.rejects(doc.save(),/TRACKING_LIMIT/);assert.equal(writes,1);
 size=20000001;await assert.rejects(trackingDocument(cfg,'a',f),/TRACKING_PRIVATE/);await assert.rejects(driveTracking(cfg,['a'],f),/TRACKING_PRIVATE/);
});
test('login reuses tracking reads for authorized warehouse and excludes costs for readers',async()=>{
 const original=globalThis.fetch;let reads=0;
 const payload={schemaVersion:1,kind:'tracking',branch:{id:'a'},copiedAt:new Date().toISOString(),rows:[{serial:'024000001'}],warehouse:{rows:[{id:'active'},{id:'deleted',deleted_at:'today'}],movements:[],costs:{total_cents:100},audit:[{secret:'private'}]}};
 globalThis.fetch=async url=>url.includes('/files/tracking')?(url.includes('alt=media')?(reads++,Response.json(payload)):Response.json({parents:['folder'],size:200,shared:false})):mock()(url);
 const run=async(views,owner)=>{const user={permissions:{views,owner},branches:[{id:'a'}]};const env={DRIVE_CONFIG:JSON.stringify({...config,tracking:{a:'tracking'}}),AUTH:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json(user)})}};return (await worker.fetch(new Request('https://test.example/api/session'),env)).json();};
 try{let u=await run(['stock','warehouse'],true);assert.equal(reads,1);assert.equal(u.warehouse[0].costs.total_cents,100);assert.equal(u.warehouse[0].audit,undefined);assert.equal(u.warehouse[0].rows.length,1);assert.equal(u.tracking[0].warehouse,undefined);
 u=await run(['warehouse'],false);assert.equal(u.tracking,undefined);assert.equal(u.warehouse[0].costs,null);
 u=await run(['stock'],true);assert.equal(u.warehouse,undefined);assert.equal(u.tracking[0].warehouse,undefined);
 }finally{globalThis.fetch=original;}
});

test('lightweight login returns auth before operational data and does not call Drive',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('External access forbidden');};
 try{const env={AUTH:{idFromName:x=>x,get:()=>({fetch:async()=>Response.json({username:'test',permissions:{views:['stock']},branches:[{id:'a'}]},{headers:{'Set-Cookie':'test-cookie'}})})},OPERATIONS:{get:()=>{throw Error('Barrier must not block auth');}}};const r=await worker.fetch(new Request('https://test.example/api/login?bootstrap=0',{method:'POST',headers:{origin:'https://test.example','content-type':'application/json'},body:'{}'}),env);assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),'test-cookie');assert.equal((await r.json()).tracking,undefined);}finally{globalThis.fetch=original;}
});
