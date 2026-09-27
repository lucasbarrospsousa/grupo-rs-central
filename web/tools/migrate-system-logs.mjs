import {readFile} from 'node:fs/promises';
import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true});
try{
 const version=Number((await pool.query('select max(version) version from central_homologacao.migrations')).rows[0].version);
 if(version<17||version>18)throw Error('Unexpected migration version');
 if(version===17)await pool.query(await readFile(new URL('../migrations/018_system_logs.sql',import.meta.url),'utf8'));
 console.log(JSON.stringify({version:18,ready:true}));
}finally{await pool.end();}
