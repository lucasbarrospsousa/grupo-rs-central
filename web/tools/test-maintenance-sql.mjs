import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createPool} from '../backend/database.mjs';import {businessMutation} from '../backend/business.mjs';
const pool=createPool(),c=await pool.connect();let checks=0;
try{await c.query('BEGIN');
 const user={user_id:(await c.query("select user_id from central_homologacao.memberships where branch_id='imperatriz' limit 1")).rows[0].user_id};await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);
 const branch='imperatriz',a=randomUUID(),b=randomUUID(),serialA='990'+String(Date.now()),serialB='991'+String(Date.now());
 for(const [id,serial,status] of [[a,serialA,'Instalado'],[b,serialB,'Estoque']])await c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,branch,serial,{status,plate:status==='Instalado'?'OLD1A00':'',client:'Old local snapshot',identification:'AAA - 001'}]);
 const service={clients:async()=>[{id:'1',name:'Synthetic client'}],clientVehicles:async()=>[{vehicle_id:'2',plate:'DEM1A00',serial:serialA}]};
 const body={vehicle:a,vehicleVersion:1,replacement:b,replacementVersion:1,clientId:'1',clientName:'Synthetic client',vehicleId:'2',plate:'DEM1A00',reason:'Troca de aparelho',medium:'Consultor informou',notes:'Synthetic'};
 const args={path:'/api/maintenance',method:'POST',body,branch,user,role:'admin',service};
 const result=await businessMutation(c,args);const saved=(await c.query('select data,version from central_homologacao.visits where id=$1',[result.id])).rows[0];assert.equal(saved.data.status,'Concluída');assert.equal(saved.data.plate,'DEM1A00');assert.equal(saved.data.client,'Synthetic client');checks++;
 const replacement=(await c.query('select data,version from central_homologacao.devices where id=$1',[b])).rows[0];assert.equal(replacement.data.status,'Instalado');assert.equal(replacement.data.plate,'DEM1A00');assert.equal(replacement.version,2);checks++;
 assert.equal((await c.query('select data from central_homologacao.devices where id=$1',[a])).rows[0].data.plate,'OLD1A00');checks++;
 await assert.rejects(businessMutation(c,args),/indisponível/);checks++;
 await businessMutation(c,{...args,path:'/api/maintenance/'+result.id,method:'PATCH',body:{version:1,reason:body.reason,medium:body.medium,notes:'Updated'}});
 assert.equal((await c.query('select version from central_homologacao.devices where id=$1',[b])).rows[0].version,2);assert.equal((await c.query('select data from central_homologacao.visits where id=$1',[result.id])).rows[0].data.notes,'Updated');checks++;
 await assert.rejects(businessMutation(c,{...args,path:'/api/maintenance/'+result.id,method:'PATCH',body:{version:2,reason:'Sem comunicação',medium:body.medium,notes:'Invalid'}}),/preserva/);checks++;
 await assert.rejects(businessMutation(c,{...args,body:{...body,clientId:'invalid'}}),/Cliente não confirmado/);checks++;
 await assert.rejects(businessMutation(c,{...args,role:'reader'}),/leitura/);checks++;
 // No operations escape this transaction; no API or SMS access.
 await c.query('ROLLBACK');console.log(JSON.stringify({checks,rolledBack:true,platformWrites:0,sms:0}));
}finally{await c.query('ROLLBACK');c.release();await pool.end();}
