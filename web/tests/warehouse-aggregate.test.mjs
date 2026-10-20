import test from 'node:test';
import assert from 'node:assert/strict';
import {sqlWarehouseAggregate,warehouseAggregateQuery} from '../backend/warehouse-aggregate.mjs';
import {selectWarehouseView} from '../backend/warehouse-view.mjs';
const p=o=>new URLSearchParams({month:'2026-10',...o});
test('warehouse aggregate parameters stay bound and branch/RLS scope is retained',()=>{
 const query="' OR true --",q=warehouseAggregateQuery('imperatriz',p({view:'movements',query}));
 assert.ok(!q.sql.includes(query));assert.equal(q.values[4],query.toLowerCase());assert.match(q.sql,/branch_id=\$1/);assert.match(q.sql,/limit 8 offset/);
 for(const input of [{view:'monthly',months:7},{view:'overview',month:'invalid'},{view:'movements',page:-1}])assert.throws(()=>warehouseAggregateQuery('imperatriz',p(input)));
});
// Pure SELECT fixtures: no tables, users, inventory or provider APIs are changed.
test('SQL aggregates match existing warehouse rules with synthetic read-only fixtures',{skip:process.env.CENTRAL_SQL_READ_TEST!=='1'},async()=>{
 const {createPool}=await import('../backend/database.mjs');const pool=createPool(),c=await pool.connect();
 const rows=Array.from({length:28},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,branch:'imperatriz',branch_id:'imperatriz',serial:'024TEST'+i,kind:i%3?'device':'chip',status:i%4?'Disponível':'Enviado',chip_operator:['TIM','tim','Claro',''][i%4],classification:['Estoque','Reserva','Emergência'][i%3],activation_state:i%3?'active':'requested',activation_at:'2026-10-02T12:00:00Z',received_at:'2026-10-01T10:00:00Z',deleted_at:null}));
 const movements=Array.from({length:24},(_,i)=>({id:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,branch:'imperatriz',branch_id:'imperatriz',destination:['Araguaína • base','Açailândia','Cliente Externo','Marabá'][i%4],note:i===23?'Último %_ especial':'Teste',created_at:`2026-${i%2?'10':'09'}-${String(i+1).padStart(2,'0')}T12:00:00Z`,items:[{serial:rows[i].serial,kind:i%5?rows[i].kind:undefined,action:i%6?'Envio':'Utilizado',time_basis:i%6?'dispatch':'detection'}]}));
 movements.push({...movements[1],id:'20000000-0000-4000-8000-000000000001',created_at:'2026-10-19T12:00:00Z'});
 movements.push({id:'20000000-0000-4000-8000-000000000002',branch:'imperatriz',branch_id:'imperatriz',destination:'Imperatriz',note:'Data inválida',created_at:'2026-10-01T12:00:00Z',items:[{serial:'unknown',kind:'device',detected_at:'invalid'}]});
 const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
 const fixtures=`fixture_inventory as (select * from jsonb_to_recordset(${literal(rows)}) x(id uuid,branch_id text,serial text,kind text,status text,classification text,chip_operator text,activation_state text,activation_at timestamptz,received_at timestamptz,deleted_at timestamptz)), fixture_movements as (select * from jsonb_to_recordset(${literal(movements)}) x(id uuid,branch_id text,destination text,note text,created_at timestamptz,items jsonb)), `;
 const adapter={query:(sql,values)=>c.query(sql.replace('with inventory',`with ${fixtures} inventory`).replaceAll('central_homologacao.warehouse_items','fixture_inventory').replaceAll('central_homologacao.warehouse_movements','fixture_movements'),values)};
 const normalize=r=>JSON.parse(JSON.stringify(r));
 try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='5000ms'");
 for(const input of [{view:'overview'},{view:'overview',month:'2026-09'},{view:'monthly'},{view:'monthly',months:3,destination:'araguaina'},{view:'monthly',months:12,destination:'custom:Cliente Externo'},...['all','devices','chips','shipments'].map(status=>({view:'movements',status,month:''})),{view:'movements',query:'%_',month:''},{view:'movements',destination:'custom:Cliente Externo',month:''},{view:'movements',destination:'araguaina',month:''},{view:'movements',page:99,month:''}]){
  const params=p(input),actual=await sqlWarehouseAggregate(adapter,'imperatriz',params),expected=selectWarehouseView({rows,movements},params);
  assert.deepEqual(actual.counts,expected.counts,'counts '+JSON.stringify(input));
  if(input.view==='movements'){
   assert.equal(actual.total,expected.total);assert.equal(actual.page,expected.page);assert.deepEqual(actual.stats,expected.stats);
   for(const key of ['id','serial','type','destination','at','detected','kind','branch','deviceSerial','phone','note'])assert.deepEqual(actual.rows.map(r=>r[key]),expected.rows.map(r=>r[key]),key+JSON.stringify(input));
  }else if(input.view==='overview'){
   assert.deepEqual(actual.carriers,expected.carriers);const fields=['available','chipTotal','chipCounts','sent','activated','pending','destinations','daily'];for(const key of fields)assert.deepEqual(actual.data[key],expected.data[key],key+JSON.stringify(input));
   const compact=list=>list.map(b=>({id:b.id,kind:b.kind,destinationName:b.destinationName,detected:b.detected,count:b.count,at:+new Date(b.atISO)})).sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(compact(actual.data.batches),compact(expected.data.batches));
  }else assert.deepEqual(normalize(actual),normalize(expected),JSON.stringify(input));
 }
 const empty=await sqlWarehouseAggregate(adapter,'other',p({view:'overview'}));assert.equal(empty.data.sent,0);assert.equal(empty.counts.device.total,0);
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
});
