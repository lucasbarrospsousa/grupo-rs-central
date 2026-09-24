import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Buffer} from 'node:buffer';
export const SCHEMA='central_homologacao';
export const MAX_BYTES=24*1024*1024;
export const quote=s=>'"'+s.replaceAll('"','""')+'"';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
export function canonical(v){return JSON.stringify(sort(v));}
function sort(v){return Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;}
export function encryptBackup(snapshot,key){
 if(!/^[a-f0-9]{64}$/.test(key||''))throw Error('BACKUP_KEY_INVALID');
 const plain=Buffer.from(JSON.stringify(snapshot));if(plain.length>MAX_BYTES)throw Error('BACKUP_TOO_LARGE');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),nonce);
 const header=Buffer.from('GRSC-BACKUP-2\n');cipher.setAAD(header);
 const encrypted=Buffer.concat([cipher.update(gzipSync(plain)),cipher.final()]);
 return Buffer.concat([header,nonce,cipher.getAuthTag(),encrypted]);
}
export function decryptBackup(bytes,key){
 const header=Buffer.from('GRSC-BACKUP-2\n');
 if(bytes.length>MAX_BYTES||bytes.length<header.length+29||!bytes.subarray(0,header.length).equals(header)||!/^[a-f0-9]{64}$/.test(key||''))throw Error('BACKUP_INVALID');
 const offset=header.length,cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),bytes.subarray(offset,offset+12));
 cipher.setAAD(header);cipher.setAuthTag(bytes.subarray(offset+12,offset+28));
 const json=gunzipSync(Buffer.concat([cipher.update(bytes.subarray(offset+28)),cipher.final()]),{maxOutputLength:MAX_BYTES});
 const out=JSON.parse(json.toString('utf8'));if(out.format!==2||out.schema!==SCHEMA||!out.tables||!out.definitions)throw Error('BACKUP_INVALID');return out;
}
export async function takeSnapshot(c,migrations={}){
 // One MVCC snapshot across tables. No database rows are written here.
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const tables=(await c.query('select tablename from pg_tables where schemaname=$1 order by tablename',[SCHEMA])).rows.map(r=>r.tablename);
  const snapshot={format:2,at:new Date().toISOString(),schema:SCHEMA,migrations,tables:{},definitions:{},scope:'Central private schema; external Storage objects and service secrets require separate recovery.'};let bytes=0;
  for(const table of tables){
   // Refuse before aggregating an unexpectedly large table into Edge memory.
   const size=Number((await c.query(`select coalesce(sum(octet_length(to_jsonb(t)::text)),0) as bytes from ${SCHEMA}.${quote(table)} t`)).rows[0].bytes);
   bytes+=size;if(bytes>MAX_BYTES)throw Error('BACKUP_TOO_LARGE');
   snapshot.tables[table]=(await c.query(`select to_jsonb(t) as row from ${SCHEMA}.${quote(table)} t`)).rows.map(r=>r.row);
  }
  snapshot.definitions.columns=(await c.query(`select c.relname as table_name,a.attname as name,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as not_null,a.attidentity as identity,pg_get_expr(d.adbin,d.adrelid) as default_expression from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname=$1 and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`,[SCHEMA])).rows;
  snapshot.definitions.constraints=(await c.query(`select c.relname as table_name,k.conname as name,k.contype as type,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 order by c.relname,k.conname`,[SCHEMA])).rows;
  snapshot.definitions.indexes=(await c.query('select tablename,indexname,indexdef from pg_indexes where schemaname=$1 order by indexname',[SCHEMA])).rows;
  snapshot.definitions.functions=(await c.query(`select p.proname as name,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.prokind='f' order by p.proname`,[SCHEMA])).rows;
  snapshot.definitions.sequences=(await c.query('select * from pg_sequences where schemaname=$1',[SCHEMA])).rows;
  snapshot.definitions.policies=(await c.query('select * from pg_policies where schemaname=$1',[SCHEMA])).rows;
  snapshot.definitions.triggers=(await c.query(`select c.relname as table_name,t.tgname as name,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and not t.tgisinternal`,[SCHEMA])).rows;
  snapshot.definitions.table_security=(await c.query(`select c.relname as table_name,c.relrowsecurity as rls,c.relforcerowsecurity as force_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=$1 and c.relkind='r'`,[SCHEMA])).rows;
  snapshot.definitions.grants=(await c.query('select * from information_schema.role_table_grants where table_schema=$1',[SCHEMA])).rows;
  await c.query('COMMIT');return snapshot;
 }catch(e){await c.query('ROLLBACK');throw e;}
}
export async function verifyRestore(c,snapshot){
 // Restore each saved table into isolated temporary tables, never operational ones.
 if(snapshot.format!==2||snapshot.schema!==SCHEMA)throw Error('BACKUP_INVALID');
 await c.query('BEGIN');let rows=0;
 try{
  let i=0;for(const [table,data] of Object.entries(snapshot.tables)){
   if(!/^[a-z_][a-z0-9_]*$/.test(table)||!Array.isArray(data))throw Error('BACKUP_INVALID');
   const temp='backup_restore_'+i++;
   const cols=snapshot.definitions.columns.filter(x=>x.table_name===table);
   if(!cols.length)throw Error('BACKUP_DEFINITION_MISSING');
   // Types come from trusted PostgreSQL catalog in this locally-authenticated backup.
   if(cols.some(x=>!/^([a-zA-Z0-9_ .,"\[\]()])+$/u.test(x.type)))throw Error('BACKUP_TYPE_UNSUPPORTED');
   await c.query(`create temporary table ${quote(temp)} (${cols.map(x=>`${quote(x.name)} ${x.type}${x.not_null?' not null':''}`).join(',')}) on commit drop`);
   await c.query(`insert into ${quote(temp)} select * from jsonb_populate_recordset(null::pg_temp.${quote(temp)},$1::jsonb)`,[JSON.stringify(data)]);
   for(const k of snapshot.definitions.constraints.filter(x=>x.table_name===table&&['p','u','c'].includes(x.type)))await c.query(`alter table ${quote(temp)} add ${k.definition}`);
   const restored=(await c.query(`select to_jsonb(t) as row from ${quote(temp)} t`)).rows.map(r=>r.row);
   if(canonical(restored.map(canonical).sort())!==canonical(data.map(canonical).sort()))throw Error('BACKUP_RESTORE_MISMATCH');rows+=restored.length;
  }
  // Cross-table foreign keys are verified on the restored data too.
  const mapping=new Map(Object.keys(snapshot.tables).map((t,n)=>[t,'backup_restore_'+n]));
  for(const k of snapshot.definitions.constraints.filter(x=>x.type==='f')){
   const def=k.definition.replace(/REFERENCES (?:central_homologacao\.)?"?([a-z_][a-z0-9_]*)"?\(/g,(all,t)=>{if(!mapping.has(t))throw Error('BACKUP_EXTERNAL_REFERENCE');return 'REFERENCES pg_temp.'+quote(mapping.get(t))+'(';});
   if(!def.includes('REFERENCES pg_temp.'))throw Error('BACKUP_EXTERNAL_REFERENCE');
   await c.query(`alter table ${quote(mapping.get(k.table_name))} add ${def}`);
  }
  await c.query('ROLLBACK');return {tables:Object.keys(snapshot.tables).length,rows};
 }catch(e){await c.query('ROLLBACK');throw e;}
}
