import {readFile} from 'node:fs/promises';
import {randomUUID,randomInt} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('BEGIN');
 const v=Number((await c.query('select max(version) v from central_homologacao.migrations')).rows[0].v);
 if(![20,21].includes(v))throw Error('Unexpected schema version');
 if(v===20)await c.query((await readFile(new URL('../migrations/021_manual_contacts.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 await c.query('SAVEPOINT fixture');
 const id=randomUUID(),serial=String(randomInt(800000000,899999999)),chips=[0,1].map(i=>'89'+String(randomInt(100000000,999999999))+'0000000'+i),phone='11999990001';
 for(const chip of chips)await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,'imperatriz','chip',$2,'Disponível',now())",[randomUUID(),chip]);
 await c.query("insert into central_homologacao.devices(id,branch_id,serial,data) values($1,'imperatriz',$2,$3)",[id,serial,{serial,status:'Estoque',iccid:chips[1],phone,pending_contacts:{iccid:chips[1],phone}}]);
 const observe=chip=>c.query('select central_homologacao.apply_device_contacts($1,$2,now())',[id,{ok:true,serial,iccid:chip,phone}]);
 const read=async()=>(await c.query('select data from central_homologacao.devices where id=$1',[id])).rows[0].data;
 await observe(chips[0]);assert.equal((await read()).iccid,chips[1]);assert.ok((await read()).pending_contacts);
 assert.equal((await c.query('select status from central_homologacao.warehouse_items where serial=$1',[chips[0]])).rows[0].status,'Disponível');
 assert.equal((await c.query('select status from central_homologacao.warehouse_items where serial=$1',[chips[1]])).rows[0].status,'Utilizado');
 await observe(chips[1]);assert.equal((await read()).pending_contacts,null);
 await observe(chips[0]);assert.equal((await read()).iccid,chips[0]);
 await c.query('ROLLBACK TO SAVEPOINT fixture');
 await c.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({migration:21,applied:process.argv.includes('--apply'),tests:'manual chip retained, warehouse consumption, stale observation ignored, upstream confirmation resumes sync; all fixture data rolled back'}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
