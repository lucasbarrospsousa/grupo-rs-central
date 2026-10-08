import {readFile} from 'node:fs/promises';import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true}),c=await pool.connect();
try{
 const exists=(await c.query('select 1 from central_homologacao.migrations where version=38')).rowCount;
 if(!exists){const sql=await readFile(new URL('../migrations/038_auto_link.sql',import.meta.url),'utf8');await c.query(sql.replace(/COMMIT;\s*$/,''));}
 else await c.query('begin');
 // Transactional fixture: uniqueness and isolation, no external API calls.
 await c.query('savepoint fixtures');
 const branches=(await c.query('select id from central_homologacao.branches order by id limit 2')).rows;
 for(const b of branches)await c.query("insert into central_homologacao.link_targets(branch_id,prefix,number,plate,vehicle_id,client_id) values($1,'AAA',999999,'AAA - 999999',null,'1')",[b.id]);
 const n=(await c.query("select count(*)::int n from central_homologacao.link_targets where prefix='AAA' and number=999999")).rows[0].n;
 if(n!==2)throw Error('Cross-base isolation failed');
 await c.query('rollback to savepoint fixtures');
 await c.query(process.argv.includes('--apply')?'commit':'rollback');console.log('PASS lot schema and independent base ranges; applied='+process.argv.includes('--apply'));
}finally{await c.query('rollback').catch(()=>{});c.release();await pool.end();}
