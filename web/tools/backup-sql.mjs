// Private SQL data backup, verified by restoring into transaction-local tables.
// Never restores over operational tables and never prints row contents.
import {createPool,privatePath} from '../backend/database.mjs';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const pool=createPool({admin:true}),c=await pool.connect();
const quote=s=>'"'+s.replaceAll('"','""')+'"';
try {
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
 const tables=(await c.query("select tablename from pg_tables where schemaname='central_homologacao' order by tablename")).rows.map(r=>r.tablename);
 const snapshot={format:1,at:new Date().toISOString(),schema:'central_homologacao',migrations:{},tables:{}};
 for(const name of await readdir(new URL('../migrations/',import.meta.url)))if(name.endsWith('.sql'))snapshot.migrations[name]=await readFile(new URL('../migrations/'+name,import.meta.url),'utf8');
 for(const table of tables){
  snapshot.tables[table]=(await c.query(`select to_jsonb(t) as row from central_homologacao.${quote(table)} t`)).rows.map(r=>r.row);
 }
 const file=privatePath('sql-backup-'+Date.now()+'.json'),bytes=JSON.stringify(snapshot);
 await writeFile(file,bytes,{mode:0o600});
 const readback=await readFile(file,'utf8');if(readback!==bytes)throw Error('Backup readback mismatch');
 const saved=JSON.parse(readback);let rows=0;
 for(let i=0;i<tables.length;i++){
  const table=tables[i],temp='restore_check_'+i;
  await c.query(`create temporary table ${quote(temp)} (like central_homologacao.${quote(table)} including all) on commit drop`);
  await c.query(`insert into ${quote(temp)} overriding system value select * from jsonb_populate_recordset(null::central_homologacao.${quote(table)},$1::jsonb)`,[JSON.stringify(saved.tables[table])]);
  const restored=(await c.query(`select to_jsonb(t) as row from ${quote(temp)} t`)).rows.map(r=>r.row);
  const stable=value=>JSON.stringify(value,Object.keys(value).sort());
  if(JSON.stringify(restored.map(stable).sort())!==JSON.stringify(saved.tables[table].map(stable).sort()))throw Error('Restore mismatch: '+table);
  rows+=restored.length;
 }
 await c.query('ROLLBACK');
 const result={file,sha256:createHash('sha256').update(bytes).digest('hex'),at:snapshot.at,tables:tables.length,rows,restoreVerified:true,scope:'Isolated temporary tables, no operational overwrite'};
 await writeFile(privatePath('sql-backup-latest.json'),JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify(result));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
