import test from 'node:test';
import assert from 'node:assert/strict';
import {Integrations} from '../backend/integrations.mjs';
import {PortalRead} from '../backend/portal-read.mjs';
import {integrationSessions} from '../backend/integration-sessions.mjs';
import {guardedIntegrations} from '../backend/background-sync.mjs';

function fixture(){
 const pool={},counts={api:0,web:0,reads:0};
 const secrets={grupo_rs_modern_user:'synthetic',grupo_rs_modern_password:'synthetic'};
 let reject=false,timeout=false;
 const request=async(url,options)=>{
  if(url.endsWith('/login')){counts.api++;await Promise.resolve();return{text:JSON.stringify({token:'synthetic-'+counts.api}),headers:new Headers()};}
  if(url.endsWith('/login.php')){counts.web++;return{text:'OK',headers:new Headers({'set-cookie':'sid=synthetic; HttpOnly'})};}
  counts.reads++;
  if(timeout)throw Error('Tempo esgotado');
  if(reject){reject=false;throw Object.assign(Error('expired'),{upstreamStatus:401});}
  return{text:url.includes('/api_rest_app/')?'{}':'<table><tbody></tbody></table>',headers:new Headers()};
 };
 const client=(target=pool)=>new Integrations({secrets:()=>secrets,request,sessionStore:integrationSessions(target)});
 return{pool,counts,secrets,client,expire:()=>{reject=true;},timeout:v=>{timeout=v;}};
}
test('ten separate batches reuse one API and one web login, without caching reads',async()=>{
 const f=fixture();
 for(let i=0;i<10;i++){const api=f.client();await api.api('imperatriz','/test');await new PortalRead(api).page('imperatriz','/cadastro/veiculos_listar.php');}
 assert.deepEqual(f.counts,{api:1,web:1,reads:20});
});
test('concurrent clients share the API and portal login in progress',async()=>{
 const f=fixture();
 await Promise.all(Array.from({length:10},async()=>{const api=f.client();await api.api('imperatriz','/test');await new PortalRead(api).page('imperatriz','/cadastro/veiculos_listar.php');}));
 assert.deepEqual(f.counts,{api:1,web:1,reads:20});
});
test('branches, pools and credential changes cannot reuse another authentication',async()=>{
 const f=fixture(),a=f.client();await a.api('imperatriz','/test');
 await f.client().api('maraba','/test');await f.client({}).api('imperatriz','/test');
 f.secrets.grupo_rs_modern_password='changed-synthetic';await a.api('imperatriz','/test');
 assert.equal(f.counts.api,4);
 await new PortalRead(a).page('imperatriz','/cadastro/veiculos_listar.php');
 f.secrets.grupo_rs_modern_password='changed-again';await new PortalRead(a).page('imperatriz','/cadastro/veiculos_listar.php');assert.equal(f.counts.web,2);
});
test('expiry renews once, timeout preserves session, local TTL still expires',async()=>{
 const f=fixture();await f.client().api('imperatriz','/test');f.expire();await f.client().api('imperatriz','/test');assert.equal(f.counts.api,2);
 f.timeout(true);await assert.rejects(f.client().api('imperatriz','/test'),/Tempo esgotado/);f.timeout(false);await f.client().api('imperatriz','/test');assert.equal(f.counts.api,2);
 f.client().sessions.get('imperatriz').at=0;await f.client().api('imperatriz','/test');assert.equal(f.counts.api,3);
});
test('new batch wrappers share authentication storage but never guard state',()=>{
 const pool={query:async()=>({rows:[{blocked:false}]})};
 const a=guardedIntegrations(pool,undefined,{apiOnly:true,captureCodes:false}),b=guardedIntegrations(pool,undefined,{apiOnly:true,captureCodes:false});
 assert.notEqual(a,b);assert.equal(a.sessions.entries,b.sessions.entries);assert.equal(a.portalSessions.entries,b.portalSessions.entries);
});
test('late concurrent 401 does not discard the newly renewed API token',async()=>{
 let logins=0,oldReads=0,release;
 const waiting=new Promise(resolve=>{release=resolve;}),pool={};
 const request=async(url,options)=>{
  if(url.endsWith('/login'))return{text:JSON.stringify({token:'token-'+(++logins)}),headers:new Headers()};
  if(options.headers.Authorization==='Bearer token-1'){
   if(++oldReads===1)await waiting;
   throw Object.assign(Error('expired'),{upstreamStatus:401});
  }
  release();return{text:'{}',headers:new Headers()};
 };
 const client=()=>new Integrations({secrets:()=>({grupo_rs_modern_user:'synthetic',grupo_rs_modern_password:'synthetic'}),request,sessionStore:integrationSessions(pool)});
 await Promise.all([client().api('imperatriz','/test'),client().api('imperatriz','/test')]);assert.equal(logins,2);
});
test('portal session rejection renews once and reuses the renewed cookies',async()=>{
 const f=fixture(),a=f.client();let expired=true;
 const original=a.request;a.request=async(url,options)=>url.includes('veiculos_listar')&&expired?(expired=false,{text:'<form action="login.php">',headers:new Headers()}):original(url,options);
 await new PortalRead(a).page('imperatriz','/cadastro/veiculos_listar.php');
 await new PortalRead(f.client()).page('imperatriz','/cadastro/veiculos_listar.php');assert.equal(f.counts.web,2);
});
test('corrected credentials clear only the matching old authentication guard',async()=>{
 let password='old',calls=0;
 const pool={query:async()=>({rows:[{blocked:false}]})},service={credentials:()=>({username:'synthetic',password}),api:async()=>{calls++;if(password==='old')throw Object.assign(Error('invalid'),{credentialInvalid:true});return{};}};
 const guarded=guardedIntegrations(pool,service,{apiOnly:true});
 await assert.rejects(guarded.api('imperatriz','/test'));await assert.rejects(guarded.api('imperatriz','/test'));password='new';await guarded.api('imperatriz','/test');assert.equal(calls,2);
});
