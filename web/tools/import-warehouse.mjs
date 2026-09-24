import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {createPool,privatePath} from '../backend/database.mjs';
const file=privatePath('warehouse-20260924.sqlite');
const expected=JSON.parse(readFileSync(privatePath('warehouse-inventory.json'),'utf8'));
if(createHash('sha256').update(readFileSync(file)).digest('hex')!==expected.sha256)throw Error('Warehouse snapshot changed');
const source=new DatabaseSync(file,{readOnly:true});const pool=createPool({admin:true});const c=await pool.connect();
try{
 if(!(await c.query('select 1 from central_homologacao.migrations where version=2')).rowCount)await c.query(readFileSync(new URL('../migrations/002_warehouse.sql',import.meta.url),'utf8'));
 await c.query('BEGIN');await c.query("select pg_advisory_xact_lock(hashtext('central_warehouse_import'))");
 if((await c.query('select count(*)::int as n from central_homologacao.warehouse_items')).rows[0].n)throw Error('Warehouse already populated; refusing overwrite');
 const rows=source.prepare(`select i.*,case when u.number is not null then 'Utilizado' when m.number is not null then 'Enviado' else 'Disponível' end as status
 from items i left join chip_usage u on i.kind='chip' and i.number=u.number
 left join movement_items m on m.branch=i.branch and m.kind=i.kind and m.number=i.number
 left join removals r on r.branch=i.branch and r.kind=i.kind and r.number=i.number where r.number is null`).all();
 for(const r of rows)await c.query('insert into central_homologacao.warehouse_items(id,branch_id,kind,serial,status,received_at) values($1,$2,$3,$4,$5,to_timestamp($6))',[randomUUID(),r.branch,r.kind==='equipment'?'device':'chip',r.number,r.status,r.received_at]);
 await c.query('COMMIT');console.log(JSON.stringify((await c.query('select kind,status,count(*)::int as count from central_homologacao.warehouse_items group by kind,status')).rows));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();source.close();}
