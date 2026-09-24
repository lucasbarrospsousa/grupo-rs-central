import pg from 'pg';import assert from 'node:assert/strict';import {readFile,readdir,writeFile} from 'node:fs/promises';
import {connectionOptions,privatePath,createPool} from '../backend/database.mjs';
import {takeSnapshot,verifyRestore,encryptBackup,decryptBackup,sha256} from '../backend/backup-snapshot.mjs';
import {backupStatus} from '../backend/backup-status.mjs';
const db=JSON.parse(await readFile(privatePath('backup-db.json'),'utf8')),pool=new pg.Pool({...connectionOptions({admin:true}),...db,max:1}),c=await pool.connect();
try{
 const migrations={};for(const f of await readdir(new URL('../migrations/',import.meta.url)))if(f.endsWith('.sql'))migrations[f]=await readFile(new URL('../migrations/'+f,import.meta.url),'utf8');
 const snapshot=await takeSnapshot(c,migrations),key=(await readFile(privatePath('backup-key.txt'),'utf8')).trim();const encrypted=encryptBackup(snapshot,key);
 const file=privatePath('drive-backup-restore-test-'+Date.now()+'.grsc.enc');await writeFile(file,encrypted,{mode:0o600});
 const counts=await verifyRestore(c,decryptBackup(await readFile(file),key));
 for(const sql of ['update central_homologacao.devices set version=version where false','delete from central_homologacao.warehouse_items where false'])await assert.rejects(c.query(sql),e=>e.code==='42501');
 const web=createPool();try{await assert.rejects(backupStatus(web,'00000000-0000-0000-0000-000000000000'),e=>e.status===403);const user=(await web.query("select user_id from central_homologacao.memberships where role='admin' limit 1")).rows[0];assert.ok(await backupStatus(web,user.user_id));await assert.rejects(web.query('update central_homologacao.backup_control set enabled=true where false'),e=>e.code==='42501');}finally{await web.end();}
 const report={at:new Date().toISOString(),...counts,bytes:encrypted.length,sha256:sha256(encrypted),restore:'isolated temporary tables, PK/unique/check/FK constraints and all nested JSON',operationalWrites:0,permissionChecks:4};await writeFile(privatePath('backup-test-result.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
}finally{c.release();await pool.end();}
