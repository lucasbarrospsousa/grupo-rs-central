// Real runtime permissions; synthetic receipt is always rolled back.
// No device changes, serial commands or external platform requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createPool, privatePath } from '../backend/database.mjs';
const pool=createPool(),c=await pool.connect();
try {
 await c.query('begin');
 const {user_id}=JSON.parse(readFileSync(privatePath('configurator-access.json'),'utf8'));
 const key=randomUUID(),fingerprint='configurator-receipt-regression';
 const args=[user_id,key,fingerprint,{ok:true,pending:true,confirmed:false}];
 await c.query('insert into central_homologacao.requests values($1,$2,$3,$4,now())',args);
 args[3]={ok:true,confirmed:true};
 const save=()=>c.query('insert into central_homologacao.requests values($1,$2,$3,$4,now()) on conflict (user_id,request_key) do update set response=excluded.response',args);
 await save();await save();
 const rows=(await c.query('select fingerprint,response from central_homologacao.requests where user_id=$1 and request_key=$2',[user_id,key])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].fingerprint,fingerprint);assert.deepEqual(rows[0].response,args[3]);
 for(const column of ['user_id','request_key','fingerprint','created_at']){
  const {rows:[r]}=await c.query("select has_column_privilege(current_user,'central_homologacao.requests',$1,'UPDATE') as allowed",[column]);
  assert.equal(r.allowed,false,`Unexpected UPDATE permission: ${column}`);
 }
 console.log('PASS: pending -> confirmed, repeated confirmation, identity immutable; rolled back.');
} finally {await c.query('rollback');c.release();await pool.end();}
