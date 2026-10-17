import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceSqlQuery,sqlDevicePage} from '../backend/device-sql-page.mjs';
import {pageOptions,selectDevicePage} from '../backend/device-page.mjs';
import {consultRows} from '../public/consult-page.js';
const params=o=>new URLSearchParams({scope:'page',...o});
test('SQL values are bound; observation join is limited to selected rows unless sorting connectivity',()=>{
 const p=params({query:"' OR true --",sort:'serial'}),q=deviceSqlQuery('imperatriz',p,pageOptions(p));
 assert.ok(!q.sql.includes("' OR true --"));assert.equal(q.values[1],"' OR true --");
 assert.ok(!q.sql.split('), filtered')[0].includes('device_observations'));
 const cp=params({sort:'connectivity'});assert.ok(deviceSqlQuery('imperatriz',cp,pageOptions(cp)).sql.split('), filtered')[0].includes('device_observations'));
 assert.match(q.sql,/d.branch_id=\$1 and d.deleted_at is null/);
});
test('SQL differential checks against existing rules, using only synthetic read-only CTEs', {skip:process.env.CENTRAL_SQL_READ_TEST!=='1'},async()=>{
 const {createPool}=await import('../backend/database.mjs');const pool=createPool(),c=await pool.connect();
 const rows=Array.from({length:65},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,serial:String(24000000+i),branch:'imperatriz',client:i%2?'José Silva':'Ana',status:['Estoque','Reserva','Manutenção','Instalado','Inativos'][i%5],plate:'ABC-'+i,identification:'XRS '+i,carrier:['Vivo','Claro','TIM'][i%3],phone:'5599'+i,iccid:'8955'+i,installed_at:i%4?'2026-10-16T10:00:00Z':'invalid',updated_at:i%3?'2026-10-17':'',created_at:'2026-09-01',connectivity:i%2?'Off':'Online'}));
 rows[63].owner_binding={branch:'imperatriz',serial:rows[63].serial,plate:rows[63].plate,client:'José Último'};
 rows[58].owner_binding={branch:'other',serial:rows[58].serial,plate:rows[58].plate,client:'Não autorizado'};
 const literal=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
 const fixtures=`device_fixture as (select * from jsonb_to_recordset(${literal(rows.map(r=>({id:r.id,serial:r.serial,branch_id:r.branch,data:r,version:1,deleted_at:null})))}) as x(id uuid,serial text,branch_id text,data jsonb,version int,deleted_at timestamptz)), observation_fixture as (select * from jsonb_to_recordset(${literal(rows.map(r=>({device_id:r.id,data:{chip:{ok:true,connectivity:r.connectivity}},checked_at:null})))}) as x(device_id uuid,data jsonb,checked_at timestamptz)), `;
 const adapter={query:(sql,values)=>c.query(sql.replace('with parameters',`with ${fixtures} parameters`).replaceAll('central_homologacao.devices','device_fixture').replaceAll('central_homologacao.device_observations','observation_fixture'),values)};
 try{await c.query('BEGIN READ ONLY');await c.query("SET LOCAL statement_timeout='5000ms'");
 const cases=[{}, {page:99},{query:'Jose Ultimo'},{query:'Não autorizado'},{query:'ABC-64'},{query:'24000000;24000064;9999;'},{query:'%_'},{start:'2026-10-01',end:'2026-10-17'},{status:'Instalado'},...['serial','carrier','status','installed_at','connectivity'].flatMap(sort=>[1,-1].map(direction=>({sort,direction,page:2})))];
 for(const input of cases){const p=params(input),o=pageOptions(p),actual=await sqlDevicePage(adapter,'imperatriz',p,o),expected=selectDevicePage(rows,'imperatriz',o);assert.deepEqual(actual.rows.map(r=>r.serial),expected.rows.map(r=>r.serial),JSON.stringify(input));for(const k of ['total','page','counts','found','missing','batch','requested'])assert.deepEqual(actual[k],expected[k],k+JSON.stringify(input));}
 for(const input of [{query:'José'},{query:'ABC 64'},{query:'24 000 064'},{query:'XRS 64',mode:'maintenance'},{query:'',status:'Reserva'},{query:'José',customer:'José Silva',page:2}]){const p=params({scope:'lookup',...input}),o=pageOptions(new URLSearchParams({page:input.page||1})),r=await sqlDevicePage(adapter,'imperatriz',p,o);let expected=input.mode==='maintenance'?rows.filter(r=>[r.plate,r.serial,r.identification,r.client].some(v=>String(v||'').toLowerCase().includes(input.query.toLowerCase()))):consultRows(rows,input.query,input.status);if(input.customer)expected=expected.filter(r=>r.client===input.customer);assert.equal(r.total,expected.length);assert.deepEqual(r.rows.map(r=>r.serial),expected.slice((r.page-1)*10,r.page*10).map(r=>r.serial),JSON.stringify(input));}
 const exported=await sqlDevicePage(adapter,'imperatriz',params({export:1}),pageOptions(params({})));assert.equal(exported.rows.length,65);assert.equal(exported.rows[0].connectivity,rows.find(r=>r.serial===exported.rows[0].serial).connectivity);
 const regional={query:(sql,values)=>adapter.query(sql.replace("$1<>'imperatriz'","true"),values)};
 const regionalParams=params({status:'Estoque'}),regionalResult=await sqlDevicePage(regional,'imperatriz',regionalParams,pageOptions(regionalParams));assert.equal(regionalResult.total,26);assert.equal(regionalResult.counts.Estoque,26);assert.equal(regionalResult.counts.Reserva,0);
 const empty=await sqlDevicePage(adapter,'other',params({}),pageOptions(params({})));assert.equal(empty.total,0);assert.equal(empty.rows.length,0);
 }finally{await c.query('ROLLBACK');c.release();await pool.end();}
});
