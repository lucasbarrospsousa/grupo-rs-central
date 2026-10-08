import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
import {businessMutation} from '../backend/business.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('begin');
 if(!(await c.query('select 1 from central_homologacao.migrations where version=39')).rowCount){
  const sql=await readFile(new URL('../migrations/039_warehouse_classification.sql',import.meta.url),'utf8');
  await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
 }
 const actor=(await c.query("select u.id from central_homologacao.users u where username='lucasabm' and active")).rows[0];
 if(!actor)throw Error('Administrador autorizado não encontrado.');
 await c.query("select set_config('central.user_id',$1,true)",[actor.id]);
 await c.query('savepoint tests');
 const id=randomUUID(),serial='999'+String(Date.now()),branch='imperatriz';
 await c.query("insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,$2,'chip',$3,'Utilizado',now())",[id,branch,serial]);
 const args={path:'/api/warehouse/'+id,method:'PATCH',branch,user:{user_id:actor.id},role:'admin',body:{version:1,classification:'Emergência'}};
 await businessMutation(c,args);
 const row=(await c.query('select status,classification,version from central_homologacao.warehouse_items where id=$1',[id])).rows[0];assert.deepEqual(row,{status:'Utilizado',classification:'Emergência',version:2});
 await assert.rejects(businessMutation(c,args),e=>e.status===409);
 await assert.rejects(businessMutation(c,{...args,branch:'araguaina'}),e=>e.status===409);
 await assert.rejects(businessMutation(c,{...args,role:'operator'}),e=>e.status===403);
 await assert.rejects(businessMutation(c,{...args,body:{version:2,classification:'Inválida'}}),e=>e.status===400);
 await c.query('rollback to savepoint tests');
 console.log('PASS: classification, original usage preserved, stale version, other branch, permissions and invalid category; fixtures rolled back.');
 if(process.argv.includes('--classify-link')){
  if(!process.argv.includes('--apply'))throw Error('--classify-link exige --apply.');
  const rows=(await c.query("select id,branch_id,classification,status from central_homologacao.warehouse_items where kind='chip' and chip_provider='link' and deleted_at is null and classification<>'Emergência' order by id for update")).rows;
  const summary={};
  for(const branch of new Set(rows.map(r=>r.branch_id)))if(!(await c.query("select 1 from central_homologacao.memberships where user_id=$1 and branch_id=$2 and role='admin'",[actor.id,branch])).rowCount)throw Error('Filial sem autorização administrativa.');
  const ids=rows.map(r=>r.id);
  await c.query("insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) select branch_id,$1,'WAREHOUSE_CLASSIFICATION',id,jsonb_build_object('before',classification,'after','Emergência','reason','Solicitação do usuário: chips Link Solutions','status',status) from central_homologacao.warehouse_items where id=any($2::uuid[])",[actor.id,ids]);
  await c.query("update central_homologacao.warehouse_items set classification='Emergência',version=version+1 where id=any($1::uuid[])",[ids]);
  for(const r of rows){const key=r.branch_id+' / '+r.status;summary[key]=(summary[key]||0)+1;}
  const remaining=(await c.query("select count(*)::int n from central_homologacao.warehouse_items where kind='chip' and chip_provider='link' and deleted_at is null and classification<>'Emergência'")).rows[0].n;assert.equal(remaining,0);
  console.log(JSON.stringify({classified:rows.length,summary,remaining}));
 }
 await c.query(process.argv.includes('--apply')?'commit':'rollback');console.log('Applied: '+process.argv.includes('--apply'));
}catch(e){await c.query('rollback');throw e;}finally{c.release();await pool.end();}
