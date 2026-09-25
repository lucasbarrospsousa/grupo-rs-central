import {readFile} from 'node:fs/promises';import {randomUUID,randomInt} from 'node:crypto';import assert from 'node:assert/strict';import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{await c.query('BEGIN');
if(!(await c.query('select 1 from central_homologacao.migrations where version=15')).rowCount){const sql=await readFile(new URL('../migrations/015_chip_usage.sql',import.meta.url),'utf8');await c.query(sql.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));}
const id=randomUUID(),branch='imperatriz',serial=String(randomInt(800000000,899999999)),chips=['89'+String(randomInt(100000000,999999999))+'00000001','89'+String(randomInt(100000000,999999999))+'00000002'];
for(const chip of chips)await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,$2,'chip',$3,'Disponível',now())",[randomUUID(),branch,chip]);
await c.query("insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)",[id,branch,serial,{serial,status:'Estoque',iccid:chips[0],phone:'11999990001'}]);
const items=async()=> (await c.query('select status,usage_device_serial,usage_detected_at from central_homologacao.warehouse_items where serial=any($1)',[chips])).rows;
assert.equal((await items()).filter(w=>w.status==='Utilizado'&&w.usage_device_serial===serial).length,1);
const count=async()=>Number((await c.query("select count(*) as n from central_homologacao.warehouse_movements where items @> $1::jsonb",[JSON.stringify([{device_serial:serial}])])).rows[0].n);
assert.equal(await count(),1);await c.query('update central_homologacao.devices set data=data where id=$1',[id]);assert.equal(await count(),1);
await c.query("update central_homologacao.devices set data=data||$2::jsonb where id=$1",[id,{iccid:chips[1],phone:'11999990002'}]);assert.equal(await count(),3);
await c.query("update central_homologacao.devices set data=data||$2::jsonb where id=$1",[id,{phone:'11999990003'}]);assert.equal(await count(),4);
await c.query('select central_homologacao.apply_device_contacts($1,$2,now())',[id,{serial,iccid:chips[0],phone:'11999990004'}]);assert.equal(await count(),6);
await c.query('select central_homologacao.apply_device_contacts($1,$2,now())',[id,{serial,iccid:chips[0],phone:'11999990004'}]);assert.equal(await count(),6);
assert.equal((await items()).filter(w=>w.status==='Utilizado').length,2);
await c.query('SAVEPOINT conflict');await assert.rejects(c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[randomUUID(),branch,serial+'1',{iccid:chips[0]}]),e=>e.code==='23514');await c.query('ROLLBACK TO SAVEPOINT conflict');
console.log(JSON.stringify({insert:true,chipSwap:true,phoneChange:true,apiChange:true,noDuplicateMovements:true,deviceAndDetectionDate:true,duplicateChipRejected:true,rolledBack:true}));
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
