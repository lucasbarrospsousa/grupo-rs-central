import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPool } from '../backend/database.mjs';
const config=JSON.parse(readFileSync(path.join(process.env.APPDATA,'Godot/app_userdata/GRUPO RS CENTRAL/auth_config.json'),'utf8'));
if(!config.user||!config.salt||String(config.salt).includes(':')||!/^[a-f0-9]{64}$/.test(config.password_hash))throw Error('Unsupported desktop login configuration');
const pool=createPool({admin:true});const c=await pool.connect();
try{
 await c.query('BEGIN');
 const username=config.user.trim().toLowerCase();
 if((await c.query('select 1 from central_homologacao.users where username=$1',[username])).rowCount)throw Error('User already exists; no credential replaced');
 const id=randomUUID();
 await c.query('insert into central_homologacao.users(id,username,password_hash) values($1,$2,$3)',[id,username,'legacy-sha256:'+config.salt+':'+config.password_hash]);
 await c.query("insert into central_homologacao.memberships select $1,id,'admin' from central_homologacao.branches",[id]);
 await c.query('COMMIT');console.log('Existing local username imported. Password verifier upgrades to scrypt on first successful login.');
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
