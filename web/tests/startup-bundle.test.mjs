import test from 'node:test';
import assert from 'node:assert/strict';
import {bundlePaths,startupBundle} from '../backend/startup-bundle.mjs';
const user={user_id:'fixture-id',username:'fixture'},branches=[{id:'imperatriz',role:'admin'}],owner={owner:true,views:[],writes:[]};
function pool(){const calls=[];let opened=0,released=0;return {calls,get opened(){return opened},get released(){return released},query:async(sql,args)=>{calls.push({sql,args});return {rows:branches}},connect:async()=>{opened++;return {query:async(sql,args)=>{calls.push({sql,args});return {rows:[]}},release:()=>released++}}};}
test('owner plan contains bounded saved panels, all five warehouse tabs and no refresh endpoint',()=>{
 const paths=bundlePaths(user,owner,branches,'imperatriz');assert.equal(paths.length,17);
 assert.equal(paths.filter(p=>p.startsWith('devices?')&&new URLSearchParams(p.split('?')[1]).get('scope')==='discharges').length,1);
 assert.equal(paths.filter(p=>p.startsWith('warehouse?')).length,5);
 assert.equal(new Set(paths).size,paths.length);
 assert.ok(paths.every(p=>!/(refresh|maintenance\?|export|send|activation)/.test(p)));
});
test('permission plan and branch membership remain enforced',()=>{
 const paths=bundlePaths(user,{owner:false,views:['stock'],writes:[]},branches,'imperatriz');
 assert.equal(paths.length,1);assert.ok(paths[0].startsWith('devices?'));assert.ok(paths[0].includes('scope=page'));
 assert.throws(()=>bundlePaths(user,owner,branches,'maraba'),e=>e.status===403);
 assert.deepEqual(bundlePaths(user,{owner:false,views:[],writes:[]},branches,'imperatriz'),[]);
});
test('read only transactions use authenticated identity and at most two concurrent reads',async()=>{
 const db=pool();let active=0,max=0,read=0;
 const result=await startupBundle(db,user,owner,'imperatriz',{reader:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;read++;return {rows:[{fixture:true}]}}});
 assert.equal(result.ok,true);assert.equal(read,17);assert.equal(max,2);assert.equal(db.opened,2);assert.equal(db.released,2);
 assert.equal(db.calls.filter(c=>c.sql==='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY').length,2);
 assert.equal(db.calls.filter(c=>c.sql.includes('set_config')&&c.args[0]===user.user_id).length,2);
 assert.equal(db.calls.filter(c=>c.sql==='COMMIT').length,2);
});
test('one panel failure is explicit and cannot erase successful results',async()=>{
 const db=pool();const result=await startupBundle(db,user,owner,'imperatriz',{reader:async(c,path)=>{if(path==='users')throw Error('private sql failure');return {total:7}}});
 assert.equal(result.ok,false);assert.equal(result.panels.filter(p=>!p.ok).length,1);
 assert.equal(result.panels.filter(p=>p.ok&&p.data.total===7).length,16);
 assert.ok(db.calls.some(c=>c.sql==='ROLLBACK TO SAVEPOINT panel_read'));
 assert.ok(!JSON.stringify(result).includes('private sql failure'));assert.equal(db.released,2);
});
test('unauthorized branch never starts panel transactions',async()=>{
 const db=pool();await assert.rejects(startupBundle(db,user,owner,'maraba'),e=>e.status===403);assert.equal(db.opened,0);
});

test('logs reuse existing read only transaction without a nested connection',async()=>{
 const {readLogs}=await import('../backend/system-logs.mjs');const sql=[];
 const client={query:async q=>{sql.push(q);return {rows:[]}}};
 const result=await readLogs(null,owner,new URLSearchParams(),{client});
 assert.deepEqual(result.rows,[]);assert.ok(sql.length>=4);assert.ok(sql.every(q=>/^select /i.test(q)));
});
test('HTTP bundle rejects absent and expired sessions before reading panels',async()=>{
 const {api}=await import('../backend/api.mjs');
 for(const cookie of ['', 'central_session='+'a'.repeat(64)]){
  let status,out,connections=0;
  const db={query:async()=>({rows:[]}),connect:async()=>{connections++;throw Error('Unexpected read')}};
  await api(db)({url:'/api/startup-bundle?branch=imperatriz',method:'GET',headers:{cookie}}, {setHeader(){},writeHead:s=>status=s,end:s=>out=JSON.parse(s)});
  assert.equal(status,401);assert.equal(connections,0);assert.ok(out.error);
 }
});
