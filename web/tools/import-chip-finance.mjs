import {readFile,writeFile} from 'node:fs/promises';
import {createPool,privatePath} from '../backend/database.mjs';
import {importFinanceSource} from '../backend/chip-finance-import.mjs';
const path=process.argv[2];if(!path||path.startsWith('--'))throw Error('Informe o JSON privado revisado; --apply confirma a gravação.');
const sources=JSON.parse(await readFile(path,'utf8')),pool=createPool({admin:true}),c=await pool.connect();
try{
 await c.query('BEGIN');await c.query("select pg_advisory_xact_lock(hashtext('chip-finance-import'))");
 const before=(await c.query('select * from central_homologacao.chip_cost_snapshots order by provider')).rows;
 await writeFile(privatePath('chip-finance-before-'+Date.now()+'.json'),JSON.stringify(before),{mode:0o600});
 if(!(await c.query('select 1 from central_homologacao.migrations where version=53')).rowCount)await c.query((await readFile(new URL('../migrations/053_chip_invoices.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,''));
 const fingerprint=async()=> (await c.query("select md5(string_agg(id::text||branch_id||serial||coalesce(data->>'iccid','')||coalesce(data->>'plate','')||coalesce(data->>'status',''),'|' order by id)) as hash from central_homologacao.devices")).rows[0].hash;
 const prior=await fingerprint();for(const s of sources)await importFinanceSource(c,s);
 if(await fingerprint()!==prior)throw Error('Os vínculos mudaram durante a importação.');
 const result=(await c.query('select provider,jsonb_array_length(items) chips,jsonb_array_length(invoices) invoices from central_homologacao.chip_cost_snapshots order by provider')).rows;
 const applied=process.argv.includes('--apply');await c.query(applied?'COMMIT':'ROLLBACK');console.log(JSON.stringify({applied,devicesUnchanged:true,result}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
