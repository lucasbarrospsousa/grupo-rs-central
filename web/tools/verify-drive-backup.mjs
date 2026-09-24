// Read-only download and isolated restore. No operational table replacement.
import pg from 'pg';import {readFile} from 'node:fs/promises';
import {privatePath,connectionOptions} from '../backend/database.mjs';
import {BackupDrive} from '../backend/backup-drive.mjs';
import {decryptBackup,verifyRestore,sha256} from '../backend/backup-snapshot.mjs';
const db=JSON.parse(await readFile(privatePath('backup-db.json'),'utf8')),google=JSON.parse(await readFile(privatePath('backup-google.json'),'utf8')),key=(await readFile(privatePath('backup-key.txt'),'utf8')).trim();
const pool=new pg.Pool({...connectionOptions({admin:true}),...db,max:1}),c=await pool.connect();
try{const row=(await c.query("select file_id,sha256 from central_homologacao.backup_runs where state='verified' order by finished_at desc limit 1")).rows[0];if(!row)throw Error('No verified Drive backup');const bytes=await new BackupDrive(google).download(row.file_id);if(sha256(bytes)!==row.sha256)throw Error('Downloaded checksum mismatch');console.log(JSON.stringify({...(await verifyRestore(c,decryptBackup(bytes,key))),verified:true,operationalWrites:0}));}finally{c.release();await pool.end();}
