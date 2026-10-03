import {readFile,writeFile} from 'node:fs/promises';
import {createPool,privatePath} from '../backend/database.mjs';
import {openToken,CENTRAL_PROJECT} from '../backend/deployment-credential.mjs';
export async function loadDeploymentToken(){
 const pool=createPool();let row;
 try{row=(await pool.query('select encrypted from central_homologacao.deployment_credential where id=true')).rows[0];}catch(e){if(e.code!=='42P01')throw Error('Não foi possível consultar a credencial de publicação salva na Central.');}finally{await pool.end();}
 if(!row)return(await readFile(privatePath('supabase-access-token.txt'),'utf8')).trim();
 const token=await openToken(row.encrypted,(await readFile(privatePath('bridge-token.txt'),'utf8')).trim(),CENTRAL_PROJECT);
 await writeFile(privatePath('supabase-access-token.txt'),token,{mode:0o600});return token;
}
