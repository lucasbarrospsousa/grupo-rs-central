import test from 'node:test';import assert from 'node:assert/strict';
import {dischargeSeries,dischargeSummary} from '../backend/discharge-summary.mjs';
test('daily discharges preserve zeros, leap months and non-cumulative totals',()=>{const r=dischargeSeries('2024-02',[{day:'2024-02-01',count:3},{day:'2024-02-02',count:1}],new Date('2024-03-01T12:00:00Z'));assert.equal(r.daily.length,29);assert.deepEqual(r.daily.slice(0,3).map(r=>r.counts),[[3],[1],[0]]);assert.equal(r.total,4);assert.throws(()=>dischargeSeries('2026-99',[]));});
test('runtime credential reads aggregate only and rejects missing or foreign membership',{skip:process.env.CENTRAL_SQL_READ_TEST!=='1'},async()=>{
 const {createPool}=await import('../backend/database.mjs');const pool=createPool(),c=await pool.connect();
 try{
  await c.query('BEGIN READ ONLY');
  const {rows:[u]}=await c.query("select id from central_homologacao.users where username='lucasabm'");assert.ok(u);
  const {rows:[priv]}=await c.query("select has_table_privilege(current_user,'central_homologacao.audit_events','SELECT') as direct");assert.equal(priv.direct,false);
  await c.query("select set_config('central.user_id',$1,true)",[u.id]);
  const result=await dischargeSummary(c,'imperatriz','2026-10');assert.ok(result.daily.length>0);assert.ok(result.total>=0);
  await c.query('SAVEPOINT denied');await assert.rejects(()=>dischargeSummary(c,'__unassigned__','2026-10'),e=>e.code==='42501');await c.query('ROLLBACK TO SAVEPOINT denied');
  await c.query("select set_config('central.user_id','',true)");await assert.rejects(()=>dischargeSummary(c,'imperatriz','2026-10'),e=>e.code==='42501');
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
});
test('SQL aggregation keeps timezone, branch, actions and month boundaries',{skip:process.env.CENTRAL_SQL_READ_TEST!=='1'},async()=>{
 const {readFile}=await import('node:fs/promises');const {createPool}=await import('../backend/database.mjs');const pool=createPool();
 try{
 let sql=(await readFile(new URL('../migrations/062_discharge_daily_counts.sql',import.meta.url),'utf8')).split('RETURN QUERY')[1].split(';')[0].replaceAll('p_branch','$1').replaceAll('p_month','$2').replace('central_homologacao.audit_events',`(values ('imperatriz','DISCHARGE','2026-10-01T02:59:59Z'::timestamptz),('imperatriz','DISCHARGE','2026-10-01T03:00:00Z'::timestamptz),('imperatriz','POST /api/install','2026-10-02T03:00:00Z'::timestamptz),('imperatriz','POST','2026-10-02T03:00:00Z'::timestamptz),('maraba','DISCHARGE','2026-10-02T03:00:00Z'::timestamptz),('imperatriz','DISCHARGE','2026-11-01T03:00:00Z'::timestamptz))`).replace(') a',') a(branch_id,action,occurred_at)');
 const {rows}=await pool.query(sql,['imperatriz','2026-10']);assert.deepEqual(rows.map(r=>r.count),[1,1]);
 }finally{await pool.end();}
});
