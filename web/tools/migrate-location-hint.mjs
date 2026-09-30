import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createPool} from '../backend/database.mjs';
const p=createPool({admin:true}),c=await p.connect();
try{
 await c.query('BEGIN');
 const before=(await c.query('select to_jsonb(c) data from central_homologacao.sync_control c')).rows;
 const sql=(await readFile(new URL('../migrations/023_location_plate_hint.sql',import.meta.url),'utf8')).replace(/^BEGIN;/,'').replace(/COMMIT;\s*$/,'');
 await c.query(sql);await c.query(sql);
 const definition=(await c.query("select pg_get_functiondef('central_homologacao.sync_claim(uuid)'::regprocedure) definition")).rows[0].definition;
 assert.ok(definition.includes("d.data->>'plate' AS plate"));
 assert.deepEqual((await c.query('select to_jsonb(c) data from central_homologacao.sync_control c')).rows,before);
 assert.equal((await c.query("select has_function_privilege('anon','central_homologacao.sync_claim(uuid)','execute') ok")).rows[0].ok,false);
 await c.query(process.argv.includes('--apply')?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({migration:23,applied:process.argv.includes('--apply'),checks:'idempotent; job settings preserved; anonymous execution denied'}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await p.end();}
