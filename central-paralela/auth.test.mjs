import {test} from 'node:test';import assert from 'node:assert/strict';import {scryptSync} from 'node:crypto';
import {AuthService} from './auth.mjs';import {encryptUsers,decryptUsers,digest,passwordMatches} from './auth-crypto.mjs';
const hash='salt:'+scryptSync('example-password','salt',64).toString('hex');
class Storage{constructor(){this.rows=new Map();this.alarm=null;}async get(k){return structuredClone(this.rows.get(k));}async put(k,v){this.rows.set(k,structuredClone(v));}async delete(k){for(const x of Array.isArray(k)?k:[k])this.rows.delete(x);}async transaction(fn){return fn(this);}async getAlarm(){return this.alarm;}async setAlarm(t){this.alarm=t;}async list(){return this.rows;}}
function fixture(){const storage=new Storage(),auth=new AuthService({storage},{}),data={schemaVersion:1,users:[{id:'1',username:'tester',password_hash:hash,active:true,branches:[{id:'a'}],permissions:{owner:false,views:['overview'],writes:[]}}]};auth.users=async()=>structuredClone(data);return {storage,auth,data};}
const login=(username='tester',password='example-password')=>new Request('https://auth.internal/api/login',{method:'POST',headers:{'Content-Type':'application/json','x-parallel-ip':'test-ip'},body:JSON.stringify({username,password})});
test('encrypted users roundtrip and tamper/wrong-key rejection',async()=>{const key='a'.repeat(64),data={schemaVersion:1,users:[{username:'sensitive'}]},e=await encryptUsers(data,key);assert.equal(JSON.stringify(e).includes('sensitive'),false);assert.deepEqual(await decryptUsers(e,key),data);await assert.rejects(decryptUsers(e,'b'.repeat(64)));await assert.rejects(decryptUsers({...e,ciphertext:e.ciphertext.slice(8)},key));});
test('scrypt and legacy hashes accepted without plaintext storage',()=>{assert.equal(passwordMatches('example-password',hash),true);assert.equal(passwordMatches('bad',hash),false);assert.equal(passwordMatches('p','legacy-sha256:s:'+digest('s:p')),true);assert.equal(passwordMatches('p',undefined),false);});
test('login/session/CSRF/logout and old-session isolation',async()=>{const {auth}=fixture();const r=await auth.fetch(login());assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0],{csrf}=await r.json();assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);const s=await auth.fetch(new Request('https://auth.internal/api/session',{headers:{cookie}}));const user=await s.json();assert.equal(user.username,'tester');assert.equal(user.password_hash,undefined);assert.equal(s.status,200);assert.equal((await auth.fetch(new Request('https://auth.internal/api/logout',{method:'POST',headers:{cookie,'x-csrf-token':'wrong'}}))).status,403);assert.equal((await auth.fetch(new Request('https://auth.internal/api/logout',{method:'POST',headers:{cookie,'x-csrf-token':csrf}}))).status,200);assert.equal((await auth.fetch(new Request('https://auth.internal/api/session',{headers:{cookie}}))).status,401);assert.equal((await auth.fetch(new Request('https://auth.internal/api/session',{headers:{cookie:'parallel_session='+'a'.repeat(64)}}))).status,401);});
test('bad password, inactive account, rate limit and service failure',async()=>{const {auth,data}=fixture();assert.equal((await auth.fetch(login('tester','bad'))).status,401);data.users[0].active=false;assert.equal((await auth.fetch(login())).status,401);for(let i=0;i<8;i++)await auth.fetch(login('missing','bad'));assert.equal((await auth.fetch(login())).status,429);const other=fixture();other.auth.users=()=>{throw Error('Drive failed');};assert.equal((await other.auth.fetch(login())).status,503);});
test('expired sessions and permission changes invalidate access',async()=>{for(const change of ['expires','lastActivity','permissions']){const {auth,storage,data}=fixture();const r=await auth.fetch(login()),cookie=r.headers.get('set-cookie').split(';')[0];if(change==='permissions')data.users[0].permissions.views=[];else{const [key,s]=[...storage.rows].find(([k])=>k.startsWith('session:'));s[change]=0;storage.rows.set(key,s);}assert.equal((await auth.fetch(new Request('https://auth.internal/api/session',{headers:{cookie}}))).status,401);}});

test('real user loader shares concurrent reads, never caches a failed decryption and fails closed after expiry',async()=>{
 const original=globalThis.fetch,key='a'.repeat(64),{data}=fixture();
 const envelope=await encryptUsers(data,key);let mediaReads=0,broken=true;
 globalThis.fetch=async url=>{
  if(url.includes('/token'))return Response.json({access_token:'test'});
  if(url.includes('/about'))return Response.json({user:{emailAddress:'test@example.com'}});
  if(url.includes('alt=media')){mediaReads++;return Response.json(broken?{...envelope,ciphertext:'invalid'}:envelope);}
  if(url.includes('/files/users'))return Response.json({parents:['folder'],shared:false,size:100});
  return Response.json({mimeType:'application/vnd.google-apps.folder',ownedByMe:true,capabilities:{canAddChildren:true}});
 };
 try{
  const auth=new AuthService({storage:new Storage()},{AUTH_DATA_KEY:key,DRIVE_CONFIG:JSON.stringify({client_id:'test',client_secret:'test',refresh_token:'test',folder_id:'folder',auth_file_id:'users',email:'test@example.com'})});
  assert.equal((await auth.fetch(login())).status,503);
  assert.equal(auth._users,null);
  broken=false;
  const [a,b]=await Promise.all([auth.users(),auth.users()]);assert.deepEqual(a,data);assert.equal(a,b);assert.equal(mediaReads,2);
  assert.equal((await auth.fetch(login())).status,200);
  auth._usersTime=0;broken=true;
  assert.equal((await auth.fetch(login())).status,503);
  broken=false;assert.equal((await auth.fetch(login())).status,200);
 }finally{globalThis.fetch=original;}
});
