// Idempotent provisioning, private credentials only. Does not enable uploads.
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createPool,privatePath} from '../backend/database.mjs';
const pool=createPool({admin:true});
try{
 if(!(await pool.query('select 1 from central_homologacao.migrations where version=12')).rowCount)await pool.query(await readFile(new URL('../migrations/012_drive_backups.sql',import.meta.url),'utf8'));
 let db;try{db=JSON.parse(await readFile(privatePath('backup-db.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;db={user:'central_backup.vwiayytzmorcjeaszowg',password:randomBytes(40).toString('hex')};await writeFile(privatePath('backup-db.json'),JSON.stringify(db),{mode:0o600,flag:'wx'});}
 if(!/^[a-f0-9]{80}$/.test(db.password))throw Error('Invalid backup DB configuration');
 await pool.query(`ALTER ROLE central_backup LOGIN PASSWORD '${db.password}'`);
 for(const name of ['backup-key.txt','backup-token.txt'])try{await readFile(privatePath(name));}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(privatePath(name),randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});}
 await pool.query("update central_homologacao.backup_control set account_email='lucasbarrospereira13@gmail.com' where id and account_email is null");
 console.log('Backup schema and separate read-only operational login ready. Automatic uploads remain disabled until Google authorization and a verified first backup.');
}finally{await pool.end();}
