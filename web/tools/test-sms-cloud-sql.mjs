import {createPool} from '../backend/database.mjs';import {smsCloudOperation} from '../backend/sms-cloud.mjs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const pool=createPool({admin:true}),client=await pool.connect();
try{
 await client.query('BEGIN');
 await client.query('create temporary table sms_test_ops (like central_homologacao.remote_operations including defaults including indexes) on commit drop');
 await client.query('create temporary table sms_test_health (like central_homologacao.sms_bridge_status including defaults including indexes) on commit drop');
 await client.query('create trigger cloud_guard before update on sms_test_health for each row execute function central_homologacao.preserve_cloud_sms_health()');
 const c={query:(sql,args)=>client.query(sql.replaceAll('central_homologacao.remote_operations','sms_test_ops').replaceAll('central_homologacao.sms_bridge_status','sms_test_health'),args)};
 const id=randomUUID(),other=randomUUID(),device=randomUUID(),now=Math.floor(Date.now()/1000),user=randomUUID();
 for(const [key,branch] of [[id,'imperatriz'],[other,'maraba']])await c.query('insert into central_homologacao.remote_operations(id,user_id,branch_id,kind,serial,payload,state) values($1,$2,$3,$4,$5,$6,$7)',[key,user,branch,'sms','024999999',{id:key,expires_at:now+7200},'queued']);
 assert.equal((await smsCloudOperation(c,{action:'poll',ready:false},device)).jobs.length,0);
 const first=await smsCloudOperation(c,{action:'poll',ready:true},device);assert.equal(first.jobs.length,1);assert.equal(first.jobs[0].id,id);assert.ok(first.jobs[0].payload);
 assert.equal((await smsCloudOperation(c,{action:'poll',ready:true},device)).jobs[0].id,id);
 await smsCloudOperation(c,{action:'report',id,state:'received'},device);
 assert.equal((await smsCloudOperation(c,{action:'poll',ready:true},device)).jobs[0].payload,undefined);
 await smsCloudOperation(c,{action:'report',id,state:'delivered'},device);
 assert.equal((await smsCloudOperation(c,{action:'report',id,state:'received'},device)).state,'delivered');
 assert.equal((await smsCloudOperation(c,{action:'poll',ready:true},device)).jobs.length,0);
 assert.equal((await c.query('select state from central_homologacao.remote_operations where id=$1',[other])).rows[0].state,'queued');
 await client.query("select set_config('central.sms_cloud','off',true)");
 await client.query("update sms_test_health set healthy=false where branch_id='imperatriz'");
 assert.equal((await client.query("select healthy from sms_test_health where branch_id='imperatriz'")).rows[0].healthy,true);
 await client.query('ROLLBACK');console.log('SQL isolated fixtures passed: diagnostic, claim replay, ownership, branch isolation, monotonic reports, payload withheld after acknowledgement. Rolled back.');
}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();await pool.end()}
