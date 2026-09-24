import assert from 'node:assert/strict';import {randomUUID,randomInt} from 'node:crypto';import {createPool} from '../backend/database.mjs';import {configuratorOperation} from '../backend/configurator.mjs';
const pool=createPool(),c=await pool.connect();let checks=0;
try{await c.query('BEGIN');const user={user_id:(await c.query("select user_id from central_homologacao.memberships where branch_id='imperatriz' and role='admin' limit 1")).rows[0].user_id};await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);
// Every service transaction becomes a savepoint in an outer transaction that always rolls back.
const wrapper={connect:async()=>({query:(sql,args)=>sql==='BEGIN'?c.query('SAVEPOINT configurator_test'):sql==='COMMIT'?c.query('RELEASE SAVEPOINT configurator_test'):sql==='ROLLBACK'?c.query('ROLLBACK TO SAVEPOINT configurator_test'):c.query(sql,args),release:()=>{}})};
const serial='024'+String(randomInt(900000,999999)),iccid='899999'+String(Date.now()),warehouseId=randomUUID();
assert.equal((await c.query('select 1 from central_homologacao.devices where serial=$1',[serial])).rowCount,0);
await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,'imperatriz','chip',$2,'Disponível',now())",[warehouseId,iccid]);
const payload={action:'save',branch:'imperatriz',serial,iccid,phone:'11999999999',operator:'MULTI OPERADORA',version:0,key:randomUUID()};const service={equipmentPortal:async()=>({serial,iccid,phone:payload.phone})};
const saved=await configuratorOperation(wrapper,user,payload,service);assert.equal(saved.warehouse.changed,true);assert.equal((await c.query('select status from central_homologacao.warehouse_items where id=$1',[warehouseId])).rows[0].status,'Utilizado');checks++;
const again=await configuratorOperation(wrapper,user,payload,service);assert.deepEqual(again,saved);assert.equal((await c.query('select count(*)::int as n from central_homologacao.warehouse_movements where items @> $1::jsonb',[JSON.stringify([{serial:iccid}])])).rows[0].n,1);checks++;
const fresh=await configuratorOperation(wrapper,user,{...payload,version:saved.version,key:randomUUID()},service);assert.equal(fresh.warehouse.changed,false);checks++;
const badChip='899998'+String(Date.now()),badSerial='024'+String(randomInt(900000,999999));await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,'imperatriz','chip',$2,'Enviado',now())",[randomUUID(),badChip]);
await assert.rejects(configuratorOperation(wrapper,user,{...payload,serial:badSerial,iccid:badChip,key:randomUUID()},{equipmentPortal:async()=>({serial:badSerial,iccid:badChip,phone:payload.phone})}),/movimentado/);assert.equal((await c.query('select 1 from central_homologacao.devices where serial=$1',[badSerial])).rowCount,0);checks++;
await c.query('ROLLBACK');console.log(JSON.stringify({checks,rolledBack:true,platformWrites:0,sms:0}));
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
