import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('BEGIN');const version=Number((await c.query('select max(version) v from central_homologacao.migrations')).rows[0].v);if(version!==25)throw Error('Unexpected migration version '+version);
 await c.query((await readFile(new URL('../migrations/026_stock_monitor.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await c.query('SAVEPOINT verify');
 assert.equal((await c.query("select central_homologacao.is_monitored_stock('imperatriz','{\"status\":\"Reserva\"}') v")).rows[0].v,false);
 assert.equal((await c.query("select central_homologacao.is_monitored_stock('maraba','{\"status\":\"Reserva\"}') v")).rows[0].v,true);
 assert.deepEqual((await c.query('select central_homologacao.sync_claim(gen_random_uuid()) b')).rows[0].b.rows,[]);
 await c.query('select central_homologacao.configure_automation(true,15)');
 const lease=(await c.query('select gen_random_uuid() v')).rows[0].v,batch=(await c.query('select central_homologacao.sync_claim($1) b',[lease])).rows[0].b;
 assert.ok(batch.rows.length<=50);for(const row of batch.rows){assert.equal((await c.query('select central_homologacao.is_monitored_stock(branch_id,data) v from central_homologacao.devices where id=$1',[row.id])).rows[0].v,true);}
 assert.deepEqual((await c.query('select central_homologacao.sync_claim(gen_random_uuid()) b')).rows[0].b.rows,[]);
 if(batch.rows.length){const row=batch.rows[0],data={location:{ok:false},chip:{ok:false},monitor_iccid:row.iccid||'',chip_checked_at:new Date().toISOString()};assert.equal((await c.query('select central_homologacao.sync_save($1,$2,$3,$4) v',[lease,batch.cycle,row.id,data])).rows[0].v,true);assert.equal((await c.query('select central_homologacao.sync_save(gen_random_uuid(),$1,$2,$3) v',[batch.cycle,row.id,data])).rows[0].v,false);}
 await c.query('ROLLBACK TO SAVEPOINT verify');await c.query('COMMIT');console.log(JSON.stringify({migration:26,verified:'stock scope, pause, lease exclusion, save authorization; synthetic changes rolled back',pending:batch.rows.length}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
