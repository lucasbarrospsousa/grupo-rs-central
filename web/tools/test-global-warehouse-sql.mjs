import {readFile} from 'node:fs/promises';
import {randomUUID,randomInt} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
import {consumeConfiguredChip} from '../backend/configurator-warehouse.mjs';
import {businessMutation} from '../backend/business.mjs';
const pool=createPool({admin:process.argv.includes('--migration')}),c=await pool.connect();
try{
 await c.query('BEGIN');
 if(process.argv.includes('--migration')&&!(await c.query('select 1 from central_homologacao.migrations where version=40')).rowCount){const sql=await readFile(new URL('../migrations/040_global_warehouse.sql',import.meta.url),'utf8');await c.query(sql.replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));}
 const branches=['imperatriz','araguaina','acailandia','maraba'];
 const user=(await c.query("select user_id from central_homologacao.memberships where role='admin' group by user_id having count(distinct branch_id)=4 limit 1")).rows[0];assert.ok(user);
 await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);
 const ids=[],serials=[];
 for(let i=0;i<4;i++){
  const serial=String(randomInt(800000000,899999999)),chip='89'+String(randomInt(100000000,999999999))+'00000001',origin='imperatriz',destination=branches[i];
  const deviceId=randomUUID(),chipId=randomUUID();ids.push(deviceId,chipId);serials.push(serial);
  await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at,classification) values($1,$2,'device',$3,'Disponível',now(),'Estoque'),($4,$2,'chip',$5,'Disponível',now(),'Emergência')",[deviceId,origin,serial,chipId,chip]);
  const id=randomUUID();await c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,destination,serial,{serial,iccid:chip,status:'Estoque'}]);
  let rows=(await c.query('select * from central_homologacao.warehouse_items where id=any($1::uuid[])',[ [deviceId,chipId] ])).rows;
  assert.ok(rows.every(r=>r.status==='Utilizado'&&r.usage_branch===destination&&r.branch_id===origin&&r.usage_detected_at));
  const movements=async()=>(await c.query('select * from central_homologacao.warehouse_movements where items @> $1::jsonb',[JSON.stringify([{device_serial:serial}])])).rows;
  assert.equal((await consumeConfiguredChip(c,{branch:destination,serial,iccid:chip,userId:user.user_id})).changed,false);
  assert.equal((await movements()).length,2);assert.ok((await movements()).every(r=>r.branch_id===origin&&r.destination.startsWith(destination)));
  await c.query('update central_homologacao.devices set data=data where id=$1',[id]);assert.equal((await movements()).length,2);
 }
 // An entry received after its registration must also match the correct base.
 const existingSerial=String(randomInt(800000000,899999999)),existingChip='89'+String(randomInt(100000000,999999999))+'00000002';
 await c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[randomUUID(),'maraba',existingSerial,{iccid:existingChip}]);
 for(const [kind,serial] of [['device',existingSerial],['chip',existingChip]]){
  const id=randomUUID();await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,'imperatriz',$2,$3,'Disponível',now())",[id,kind,serial]);
  const row=(await c.query('select status,usage_branch from central_homologacao.warehouse_items where id=$1',[id])).rows[0];assert.deepEqual(row,{status:'Utilizado',usage_branch:'maraba'});
 }
 const transferItems=[];
 for(const branch of branches){const id=randomUUID();await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,$2,'device',$3,'Disponível',now())",[id,'imperatriz',String(randomInt(800000000,899999999))]);transferItems.push({id,version:1});}
 const result=await businessMutation(c,{path:'/api/warehouse-transfer',method:'POST',body:{items:transferItems,destination:'Destino sintético',note:'Teste revertido'},branch:'imperatriz',user,role:'admin'});
 assert.equal(result.response.count,4);
 const transfers=(await c.query("select branch_id,items from central_homologacao.warehouse_movements where destination='Destino sintético' and items @> $1::jsonb",[JSON.stringify([{id:transferItems[0].id}])])).rows;
 assert.equal(transfers[0].branch_id,'imperatriz');
 // Missing membership cannot move any selected item, even when another is allowed.
 const limited=(await c.query("select user_id from central_homologacao.memberships group by user_id having count(distinct branch_id)<4 limit 1")).rows[0];
 if(limited){await assert.rejects(businessMutation(c,{path:'/api/warehouse-transfer',method:'POST',body:{items:transferItems,destination:'Teste',note:''},branch:'imperatriz',user:limited,role:'admin'}),/Nenhum item/);}
 console.log('PASS four-base device/chip detection, origins/destinations/detection dates, no repeated movements, atomic multi-origin transfer with authenticated branch scope; all rolled back.');
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
