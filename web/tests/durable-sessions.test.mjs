import test from 'node:test';
import assert from 'node:assert/strict';
import {durableIntegrations,sessionCipher} from '../backend/durable-sessions.mjs';
import {Integrations} from '../backend/integrations.mjs';
import {PortalRead} from '../backend/portal-read.mjs';
test('encrypted cache rejects corruption, another integration and rotated keys',()=>{
 const c=sessionCipher('test-only'),sealed=c.seal({token:'private'},'api:imperatriz');
 assert.ok(!sealed.includes('private'));assert.deepEqual(c.open(sealed,'api:imperatriz'),{token:'private'});
 assert.throws(()=>c.open(sealed,'api:maraba'));assert.throws(()=>sessionCipher('rotated').open(sealed,'api:imperatriz'));
 assert.throws(()=>c.open(sealed.slice(0,-8)+'AAAAAAAA','api:imperatriz'));
});
function fixture(){
 const db=new Map();let apiLogins=0,webLogins=0,reads=0,writes=0,reject=false;
 const secrets={grupo_rs_modern_user:'service-only',grupo_rs_modern_password:'service-only'};
 const pool={query:async(sql,p)=>{
  if(sql.startsWith('select session_key'))return{rows:[...db].map(([session_key,payload])=>({session_key,payload}))};
  writes++;db.set(p[0],p[1]);return{rows:[]};
 }};
 function client(){
  const store={api:new Map(),web:new Map()};
  const api=new Integrations({secrets:()=>secrets,sessionStore:store,request:async(url)=>{
   if(url.endsWith('/login')){apiLogins++;return{text:JSON.stringify({token:'token-'+apiLogins}),headers:new Headers()}};
   if(url.endsWith('/login.php')){webLogins++;return{text:'OK',headers:new Headers({'set-cookie':'sid=test-only'})}};
   reads++;if(reject){reject=false;throw Object.assign(Error('expired'),{upstreamStatus:401})}
   return{text:url.includes('/api_rest_app/')?'{}':'<table><tbody></tbody></table>',headers:new Headers()};
  }});
  const web=new PortalRead(api);
  return durableIntegrations(pool,store,{read:()=>api.api('imperatriz','/test'),web:()=>web.page('imperatriz','/cadastro/veiculos_listar.php')},{secret:'test-only'});
 }
 return{db,secrets,client,expire:()=>{reject=true},counts:()=>({apiLogins,webLogins,reads,writes})};
}
test('new server runtimes reuse API token and web cookies without a user or browser',async()=>{
 const f=fixture();await f.client().read();await f.client().web();const writes=f.counts().writes;
 await f.client().read();await f.client().web();
 assert.deepEqual(f.counts(),{apiLogins:1,webLogins:1,reads:4,writes});
 for(const payload of f.db.values())assert.ok(!payload.includes('token-')&&!payload.includes('service-only'));
});
test('expired API renews once and changed service credentials discard saved login',async()=>{
 const f=fixture();await f.client().read();f.expire();await f.client().read();assert.equal(f.counts().apiLogins,2);
 f.secrets.grupo_rs_modern_password='changed';await f.client().read();assert.equal(f.counts().apiLogins,3);
});
test('cache outage cannot turn a completed operation into an apparent failure',async()=>{
 const store={api:new Map([['imperatriz',{fingerprint:'test',value:{at:Date.now(),token:'test'}}]]),web:new Map()};
 const s=durableIntegrations({query:async()=>{throw Error('database offline')}},store,{work:async()=>({ok:true})},{secret:'test-only'});
 assert.deepEqual(await s.work(),{ok:true});
});
test('expired persisted sessions cannot be restored by a new runtime',async()=>{
 const f=fixture();await f.client().read();
 const c=sessionCipher('test-only'),key='api:imperatriz',old=c.open(f.db.get(key),key);
 old.value.at=Date.now()-16*60*1000;f.db.set(key,c.seal(old,key));
 await f.client().read();assert.equal(f.counts().apiLogins,2);
});
