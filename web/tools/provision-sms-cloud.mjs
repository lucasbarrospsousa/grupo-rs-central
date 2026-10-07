import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {createPool,privatePath} from '../backend/database.mjs';
const pool=createPool({admin:true});
try{
 const version=Number((await pool.query('select max(version) v from central_homologacao.migrations')).rows[0].v);
 if(![36,37].includes(version))throw Error('Unexpected schema version');
 if(version===36)await pool.query(await readFile(new URL('../migrations/037_sms_cloud.sql',import.meta.url),'utf8'));
 let existing;try{existing=JSON.parse(await readFile(privatePath('sms-cloud-access.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!existing){const local=JSON.parse(await readFile(privatePath('sms-bridge.json'),'utf8'));const member=(await pool.query("select role from central_homologacao.memberships where user_id=$1 and branch_id='imperatriz'",[local.user_id])).rows[0];if(member?.role!=='admin')throw Error('Admin membership required');existing={token:randomBytes(32).toString('hex'),device:randomUUID(),user_id:local.user_id};await writeFile(privatePath('sms-cloud-access.json'),JSON.stringify(existing),{mode:0o600,flag:'wx'});}
 console.log('Cloud gateway credential provisioned privately; migration 37 ready. No SMS submitted.');
}finally{await pool.end()}
