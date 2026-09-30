import {readFile} from 'node:fs/promises';import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true});try{
 await pool.query(await readFile(new URL('../migrations/022_backup_permissions.sql',import.meta.url),'utf8'));
 const missing=(await pool.query("select tablename from pg_tables where schemaname='central_homologacao' and not has_table_privilege('central_backup',quote_ident(schemaname)||'.'||quote_ident(tablename),'SELECT')")).rows;
 if(missing.length)throw Error('Backup read grants incomplete');
 await pool.query('BEGIN');try{await pool.query('create table central_homologacao.backup_permission_fixture(id integer)');const r=(await pool.query("select has_table_privilege('central_backup','central_homologacao.backup_permission_fixture','SELECT') as read,has_table_privilege('central_backup','central_homologacao.backup_permission_fixture','INSERT') as write")).rows[0];if(!r.read||r.write)throw Error('Default permissions failed');console.log(JSON.stringify({migration:22,missing:0,futureTableRead:true,operationalWrite:false}));}finally{await pool.query('ROLLBACK')}
}finally{await pool.end()}
