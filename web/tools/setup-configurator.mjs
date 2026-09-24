import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {createPool,privatePath} from '../backend/database.mjs';
import {passwordHash} from '../backend/auth.mjs';
const db=createPool({admin:true});
try{
 let access;try{access=JSON.parse(await readFile(privatePath('configurator-access.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;access={user_id:randomUUID(),token:randomBytes(32).toString('hex')};await writeFile(privatePath('configurator-access.json'),JSON.stringify(access),{mode:0o600});}
 await db.query('BEGIN');
 await db.query('insert into central_homologacao.users(id,username,password_hash,active) values($1,$2,$3,false) on conflict(id) do nothing',[access.user_id,'service-configurador-rs300',passwordHash(randomBytes(32).toString('hex'))]);
 for(const branch of ['imperatriz','araguaina','acailandia','maraba'])await db.query("insert into central_homologacao.memberships values($1,$2,'operator') on conflict do nothing",[access.user_id,branch]);
 await db.query('COMMIT');console.log('Acesso restrito do Configurador preparado; login pessoal desabilitado para esta identidade.');
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
