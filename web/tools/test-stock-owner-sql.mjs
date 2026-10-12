import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('begin');
 if(!(await c.query('select 1 from central_homologacao.migrations where version=44')).rowCount)await c.query((await readFile(new URL('../migrations/044_stock_owner.sql',import.meta.url),'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
 if(!(await c.query('select 1 from central_homologacao.migrations where version=45')).rowCount)await c.query((await readFile(new URL('../migrations/045_code_progress.sql',import.meta.url),'utf8')).replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
 const progress=async()=>(await c.query('select central_homologacao.settings_code_progress() as data')).rows[0].data.find(r=>r.branch_id==='imperatriz');
 const baseline=await progress();
 for(const status of ['Instalado','Estoque']){
  const serial='997'+String(Date.now()),id=randomUUID(),branch='imperatriz';
  await c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,branch,serial,{status,plate:'ABC1234'}]);
  await c.query('select central_homologacao.capture_device_codes($1,$2,$3)',[branch,serial,{state:'confirmed',equipment_id:'9971',vehicle_id:'9972',api_plate:'ABC1234'}]);
  const context=(await c.query('select central_homologacao.owner_context($1,$2) as data',[branch,serial])).rows[0].data;
  if(status==='Estoque'){assert.equal(context,null);continue;}
  const owner={branch,serial,vehicle_id:'9972',equipment_id:'9971',plate:'ABC1234',client_id:'9973',client:'Titular de teste',checked_at:new Date().toISOString()};
  const save=async(version,value)=>(await c.query('select central_homologacao.owner_save($1,$2,$3,$4) as saved',[branch,serial,version,value])).rows[0].saved;
  assert.equal(await save(context.version,{...owner,vehicle_id:'999'}),false);
  assert.equal(await save(context.version,owner),true);
  const counted=await progress();assert.equal(counted.owner_confirmed,baseline.owner_confirmed+1);assert.equal(counted.owner_total,baseline.owner_total+1);assert.equal(counted.equipment_saved,baseline.equipment_saved+1);assert.equal(counted.vehicle_saved,baseline.vehicle_saved+1);
  assert.equal(await save(context.version,owner),false);
  assert.equal((await c.query('select data from central_homologacao.devices where id=$1',[id])).rows[0].data.owner_binding.client,owner.client);
  assert.equal(await save(context.version+1,null),true);assert.equal((await progress()).owner_confirmed,baseline.owner_confirmed);
 }
 console.log('SQL: exact binding, optimistic race, invalidation and stock exclusion passed; all fixtures rolled back.');
}finally{await c.query('rollback');c.release();await pool.end();}
