// Exercises only the new maintenance cache, always rolled back.
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('BEGIN');
 if(!(await c.query('select 1 from central_homologacao.migrations where version=27')).rowCount){let sql=await readFile(new URL('../migrations/027_maintenance_ignition.sql',import.meta.url),'utf8');await c.query(sql.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));}
 const branch='imperatriz',lease=randomUUID(),row={serial:'024000001',plate:'QAQ1A23',updated_at:'baseline-qa'},snapshot={count:1,fleet_total:100,rows:[row]};
 const read=async data=>(await c.query('select central_homologacao.maintenance_snapshot($1,$2) as data',[branch,data??null])).rows[0].data;
 await read(snapshot);await c.query('update central_homologacao.maintenance_control set enabled=true,lease=$1,lease_until=now()+interval \'2 minutes\' where id',[lease]);
 const save=async(token,baseline)=>(await c.query('select central_homologacao.maintenance_save($1,$2,$3,$4,$5,$6) as ok',[token,branch,row.serial,row.plate,baseline,{ignition:'off',communication_at:'2026-10-05T08:00:00-03:00'}])).rows[0].ok;
 assert.equal(await save(randomUUID(),row.updated_at),false);assert.equal(await save(lease,'different'),false);assert.equal(await save(lease,row.updated_at),true);
 assert.equal((await read(snapshot)).rows[0].ignition,'off');
 row.updated_at='new-baseline';assert.equal((await read(snapshot)).rows[0].ignition,null);
 assert.equal((await c.query("select has_function_privilege('anon','central_homologacao.maintenance_snapshot(text,jsonb,text)','EXECUTE') as allowed")).rows[0].allowed,false);
 console.log('SQL validado: cache, invalidação, lease, identidade e acesso; alterações revertidas.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
