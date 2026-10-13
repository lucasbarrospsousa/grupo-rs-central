import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
import {savedCostSnapshots,refreshCostSnapshots,summarizeCosts} from '../backend/warehouse-costs.mjs';
const pool=createPool({admin:true}),c=await pool.connect(),apply=process.argv.includes('--apply');
try{
 await c.query('BEGIN');await c.query("select pg_advisory_xact_lock(hashtext('chip-cost-migration'))");
 if(!(await c.query('select 1 from central_homologacao.migrations where version=51')).rowCount)await c.query((await readFile(new URL('../migrations/051_chip_cost_snapshots.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await c.query('SAVEPOINT fixtures');
 const user=(await c.query("select id as user_id from central_homologacao.users where username='lucasabm' and active")).rows[0];assert.ok(user);
 const fixturePool={connect:async()=>({release(){},query:(sql,p)=>c.query(sql==='BEGIN'?'SAVEPOINT scope':sql==='COMMIT'?'RELEASE SAVEPOINT scope':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT scope':sql,p)})};
 await c.query("update central_homologacao.chip_cost_snapshots set items='[]',checked_at=null,last_attempt=null,last_error=null,refresh_until=null");
 let external=0;const a='8955000000000000001',b='8955000000000000002',service={aryaRequest:async()=>{external++;return 'ICCID;STATUS;VALOR NEGOCIADO;OPERADORA\n'+a+';ATIVO;3,99;TIM\n';},linkCostBatch:async ids=>{external++;assert.deepEqual(ids,[b]);return[{iccid:b,phase__name:'Vinculado',charge_start:'2026-01-01',item__base_price:'4.49',operator__name:'Claro'}];}};
 const first=await refreshCostSnapshots(fixturePool,user,service,[{iccid:a},{iccid:b}]);assert.equal(external,2);assert.equal(first[0].rows.get(a).cents,399);assert.equal(first[1].rows.get(b).cents,449);
 await refreshCostSnapshots(fixturePool,user,service);assert.equal(external,2);
 const saved=await savedCostSnapshots(fixturePool,user);assert.equal(external,2);assert.equal(summarizeCosts([{serial:'test',iccid:b}],saved).total_cents,449);
 await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);await c.query("update central_homologacao.chip_cost_snapshots set checked_at=now()-interval '1 hour',last_attempt=now()-interval '1 hour' where provider='arya'");
 await refreshCostSnapshots(fixturePool,user,{...service,aryaRequest:async()=>{throw Error('simulated offline');},linkCostBatch:async()=>{throw Error('Link must not be called again');}});
 const failed=await savedCostSnapshots(fixturePool,user);assert.equal(failed[1].rows.get(b).cents,449);assert.ok(failed[0].last_error);assert.ok(!summarizeCosts([{serial:'test',iccid:b}],failed).complete);
 await c.query('ROLLBACK TO SAVEPOINT fixtures');await c.query(apply?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({migration:51,applied:apply,checks:'SQL persistence, saved reads, cooldown, failed refresh retains prices, RLS isolation',syntheticFixturesRolledBack:true,realProviderCalls:0}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}

if(apply){const runtime=createPool(),admin=createPool({admin:true});try{const owner=(await admin.query("select id as user_id from central_homologacao.users where username='lucasabm'")).rows[0];assert.equal((await savedCostSnapshots(runtime,owner)).length,2);assert.equal((await savedCostSnapshots(runtime,{user_id:'00000000-0000-4000-8000-000000000000'})).length,0);console.log('PASS runtime owner access and RLS isolation');}finally{await runtime.end();await admin.end();}}
