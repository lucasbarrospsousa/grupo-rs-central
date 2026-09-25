import {readFileSync,writeFileSync} from 'node:fs';
import {createPool,privatePath} from '../backend/database.mjs';
import {scoped} from '../backend/remote-actions.mjs';
import {gateway} from '../backend/gateway.mjs';
import {processSms} from '../backend/sms-queue.mjs';
const config=JSON.parse(readFileSync(privatePath('sms-bridge.json'),'utf8')),user={user_id:config.user_id},pool=createPool();
const branch='imperatriz';
const localStatus=state=>{try{writeFileSync(privatePath('sms-bridge-health.json'),JSON.stringify({state,checked_at:new Date().toISOString()}),{mode:0o600});}catch{}};
const fatal=error=>{localStatus(error?.code==='28P01'?'credentials_invalid':'restarting');process.exit(error?.code==='28P01'?78:1);};
pool.on('error',fatal);process.on('uncaughtException',fatal);process.on('unhandledRejection',fatal);
const lock=await pool.connect();
if(!(await lock.query("select pg_try_advisory_lock(hashtext('central-web-sms-bridge')) as ok")).rows[0].ok){lock.release();await pool.end();process.exit(0);}
lock.on('error',fatal);
const db=fn=>scoped(pool,user,fn);
async function tick(){
 await lock.query('select 1');
 const health=await gateway({action:'health'}).catch(()=>({ok:false}));
 await db(c=>c.query('insert into central_homologacao.sms_bridge_status(branch_id,healthy) values($1,$2) on conflict(branch_id) do update set healthy=excluded.healthy,checked_at=now()',[branch,health.ok===true]));
 localStatus(health.ok?'connected':'gateway_unavailable');
 if(!health.ok)return;
 const rows=await db(async c=>(await c.query("select * from central_homologacao.remote_operations where branch_id=$1 and kind='sms' and (state='queued' or (result ? 'bridge_attempted_at' and (state in ('pending','received','sending','indeterminate') or state='sent' and created_at>now()-interval '24 hours'))) order by case when state='sent' then 1 else 0 end,updated_at limit 30",[branch])).rows);
 for(const op of rows)await processSms(op,{
  gateway,
  claim:op=>db(async c=>(await c.query("update central_homologacao.remote_operations set state='pending',result=result||jsonb_build_object('bridge_attempted_at',now()),updated_at=now() where id=$1 and state='queued' and not(result ? 'bridge_attempted_at') returning id",[op.id])).rowCount===1),
  save:(op,state,result)=>db(c=>c.query('update central_homologacao.remote_operations set state=$2,result=result||$3::jsonb,updated_at=now() where id=$1',[op.id,state,JSON.stringify(result)]))
 });
}
let failures=0;
try{do{const watchdog=setTimeout(()=>fatal(Error('watchdog')),180000);try{await tick();failures=0;}catch(e){localStatus('connection_retry');if(e.code==='28P01'||++failures>=3)fatal(e);}finally{clearTimeout(watchdog);}if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,15000));}while(true);}finally{await lock.query("select pg_advisory_unlock(hashtext('central-web-sms-bridge'))").catch(()=>{});lock.release();await pool.end();}
