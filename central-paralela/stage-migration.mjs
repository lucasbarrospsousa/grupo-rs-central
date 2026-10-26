// Read-only source inventory and encrypted staging. Does not switch production.
import {createPool} from '../web/backend/database.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {encryptUsers,digest} from './auth-crypto.mjs';
const root=new URL('../.secrets/homologacao/',import.meta.url);
const pool=createPool(),c=await pool.connect(),snapshot={schemaVersion:1,users:[],createdAt:new Date().toISOString(),tables:{}};
try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const owner=(await c.query("select id from central_homologacao.users where username='lucasabm' and active")).rows[0];if(!owner)throw Error('Owner missing');
 await c.query("select set_config('central.user_id',$1,true)",[owner.id]);
 const available=(await c.query("select table_name from information_schema.tables where table_schema='central_homologacao' and table_type='BASE TABLE' order by table_name")).rows.map(r=>r.table_name);
 const names=available.filter(n=>/^(devices|device_observations|visits|legacy_records|branches|memberships|user_permissions|warehouse_items|warehouse_movements|chip_costs|chip_cost_snapshots|provider_cost_snapshots)$/.test(n));
 for(const name of names){const rows=(await c.query('select * from central_homologacao."'+name+'"')).rows;snapshot.tables[name]=rows;}
 snapshot.availableTables=available;await c.query('ROLLBACK');
}finally{c.release();await pool.end();}
const key=(await readFile(new URL('parallel-auth-key.txt',root),'utf8')).trim(),bytes=JSON.stringify(snapshot);
const dir=new URL('parallel-migration/'+Date.now()+'/',root);await mkdir(dir,{recursive:true});
const envelope=JSON.stringify(await encryptUsers(snapshot,key));await writeFile(new URL('source.enc.json',dir),envelope,{flag:'wx',mode:0o600});
if(digest(await readFile(new URL('source.enc.json',dir),'utf8'))!==digest(envelope))throw Error('Readback mismatch');
const report={createdAt:snapshot.createdAt,tables:Object.entries(snapshot.tables).map(([name,rows])=>({name,count:rows.length,sha256:digest(JSON.stringify(rows))})),unmappedTables:snapshot.availableTables.filter(n=>!Object.hasOwn(snapshot.tables,n)),sourceWrites:0,providerCalls:0,activated:false};
await writeFile(new URL('manifest.json',dir),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify(report));
