import test from 'node:test';import assert from 'node:assert/strict';
import {sendWarehouseActivation} from '../backend/warehouse-activation-send.mjs';
import {openAryaActivations,submitAryaActivation} from '../backend/arya-activation.mjs';
import {Integrations} from '../backend/integrations.mjs';
import {permitted} from '../backend/user-access.mjs';
const batch='11111111-1111-4111-8111-111111111111';
function fixture(n=10){
 let saved=Array.from({length:n},(_,i)=>({id:String(i),serial:'8955000000000000'+String(i).padStart(3,'0'),activation_batch:batch,activation_state:'prepared',kind:'chip',chip_provider:'arya',status:'Disponível'})),chain=Promise.resolve(),posts=0,mode='ok',open=new Map(),commits=0;
 const pool={connect:async()=>{let unlock;const old=chain;chain=new Promise(r=>unlock=r);await old;let local=structuredClone(saved);return {release:unlock,query:async(sql,p=[])=>{
  if(sql==='COMMIT'){saved=local;commits++;return {};}
  if(sql.startsWith('select *'))return {rows:structuredClone(local)};
  if(sql.startsWith('update')){for(const r of local)if(p[0].includes(r.id)&&(!sql.includes("and activation_state='sending'")||r.activation_state==='sending')){r.activation_state=sql.includes("set activation_state='sending'")?'sending':p[1];r.activation_reference=p[2];}return {};}
  if(/^(BEGIN|ROLLBACK|select pg_|select set_config|insert into)/.test(sql))return {};
  throw Error('Unexpected SQL: '+sql);
 }};}};
 const service={carrier:async(provider,iccid)=>{if(mode==='read-fail')throw Error('read fail');return {ok:true,provider,iccid,status:mode==='active'?'ATIVO':'0'};},aryaRequest:async(path,p)=>{
  if(path==='/ticket/user/table'){if(mode==='pages-fail')throw Error('read fail');const data=p.filters.status==='0'?[...open].map(([iccid,id])=>({iccid,id,type:'Ativação',statusInt:0})):[];return {status:true,data,current_page:1,last_page:1,total_filtered:data.length};}
  assert.equal(path,'/tickets/bulk/by-iccid');posts++;assert.ok(commits>0);assert.equal(p.type,3);assert.ok(p.iccids.every(iccid=>saved.some(r=>r.serial===iccid&&r.activation_state==='sending')));assert.ok(p.iccids.every(i=>!open.has(i)));
  if(mode==='timeout')throw Error('Timeout after acceptance');return {status:mode!=='rejected'};
 }};
 return {run:(extra={})=>sendWarehouseActivation({pool,user:{user_id:'test'},role:'admin',branch:'imperatriz',body:{batch,confirmed:true},service,...extra}),get saved(){return saved;},get posts(){return posts;},set mode(v){mode=v;},open,service};
}
test('10/20: durable fence, single send, repeated and concurrent clicks do not resend',async()=>{
 for(const n of [10,20]){const f=fixture(n);await Promise.all([f.run(),f.run()]);assert.equal(f.posts,1);assert.ok(f.saved.every(r=>r.activation_state==='requested'));await f.run();assert.equal(f.posts,1);}
});
test('existing Arya tickets excluded, including an entirely pending lot',async()=>{
 for(const all of [false,true]){const f=fixture();for(const r of f.saved.slice(0,all?10:2))f.open.set(r.serial,'existing-'+r.id);const r=await f.run();assert.equal(r.skipped,all?10:2);assert.equal(f.posts,all?0:1);assert.ok(f.saved.every(r=>r.activation_state==='requested'));}
});
test('timeouts and rejected/partial responses are fenced and never resent',async()=>{
 for(const mode of ['timeout','rejected']){const f=fixture();f.mode=mode;assert.equal((await f.run()).state,'uncertain');await f.run();assert.equal(f.posts,1);assert.ok(f.saved.every(r=>r.activation_state==='uncertain'));}
});
test('preflight errors and active chips prevent sending; safe retry only before POST',async()=>{
 for(const mode of ['read-fail','pages-fail','active']){const f=fixture();f.mode=mode;await assert.rejects(f.run());assert.equal(f.posts,0);assert.ok(f.saved.every(r=>r.activation_state==='prepared'));f.mode='ok';await f.run();assert.equal(f.posts,1);}
});
test('permissions and confirmation protect the send endpoint',async()=>{
 const f=fixture();for(const extra of [{branch:'maraba'},{role:'operator'},{body:{batch}}])await assert.rejects(f.run(extra));assert.equal(f.posts,0);
 assert.equal(permitted({owner:false,views:['warehouse'],writes:[]},'/api/warehouse-activation-send','POST'),false);
 assert.equal(permitted({owner:false,views:['warehouse'],writes:['warehouse']},'/api/warehouse-activation-send','POST'),true);
});
test('ticket pagination is complete and inconsistent/unknown pages fail closed',async()=>{
 const calls=[];const service={aryaRequest:async(path,p)=>{calls.push(p);return {status:true,current_page:p.page,last_page:p.filters.status==='0'?2:1,total_filtered:p.filters.status==='0'?2:0,data:p.filters.status==='0'?[{id:p.page,iccid:'895500000000000000'+p.page,type:'Ativação',statusInt:0}]:[]};}};
 assert.equal((await openAryaActivations(service)).size,2);assert.deepEqual(calls.map(x=>[x.filters.status,x.page]),[['0',1],['0',2],['2',1]]);
 for(const data of [{status:false},{status:true,data:[],current_page:1,last_page:21,total_filtered:0},{status:true,data:[],current_page:1,last_page:1,total_filtered:1},{status:true,data:[{id:1,iccid:'8955000000000000001',type:'Ativação',statusInt:9}],current_page:1,last_page:1,total_filtered:1}])await assert.rejects(openAryaActivations({aryaRequest:async()=>data}));
});
test('transport uses only activation type 3, validates limits and does not retry write on 401',async()=>{
 let writes=0;const s=new Integrations({secrets:()=>({arya_email:'mock',arya_password:'mock'}),request:async(url,opts)=>{if(url.endsWith('/auth'))return {text:'{"token":"mock"}',headers:new Headers()};writes++;assert.equal(url,'https://api-arya.hinovaconecta.com.br/tickets/bulk/by-iccid');assert.equal(JSON.parse(opts.body).type,3);throw Object.assign(Error('401'),{upstreamStatus:401});}});
 await assert.rejects(submitAryaActivation(s,['8955000000000000001']));assert.equal(writes,1);
 await assert.rejects(submitAryaActivation(s,Array(21).fill('8955000000000000001')));assert.equal(writes,1);
});
