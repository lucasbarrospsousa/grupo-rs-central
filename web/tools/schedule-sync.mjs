import {readFile} from 'node:fs/promises';
import {createPool,privatePath} from '../backend/database.mjs';
const pool=createPool({admin:true});
try{
 const token=(await readFile(privatePath('sync-token.txt'),'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(token))throw Error('Segredo de agendamento inválido.');
 await pool.query('CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net;');
 const existing=(await pool.query("select id from vault.secrets where name='central_sync_token'")).rows[0];
 if(existing)await pool.query('select vault.update_secret($1,$2)',[existing.id,token]);else await pool.query('select vault.create_secret($1,$2,$3)',[token,'central_sync_token','Grupo RS Central: atualização automática somente leitura']);
 // Only the database owner can execute the dispatcher or read its Vault token.
 await pool.query(`CREATE OR REPLACE FUNCTION central_homologacao.dispatch_sync() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT net.http_post(url:='https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/sync',headers:=jsonb_build_object('Content-Type','application/json','x-central-sync',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='central_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=90000)
 $$;REVOKE ALL ON FUNCTION central_homologacao.dispatch_sync() FROM PUBLIC,anon,authenticated,central_homologacao_web;`);
 // A minute dispatcher drains each bounded batch; a complete cycle waits 5 minutes.
 await pool.query("select cron.schedule('central-background-sync','* * * * *','select central_homologacao.dispatch_sync()')");
 await pool.query('update central_homologacao.sync_control set enabled=true,interval_minutes=5 where id');
 console.log('Agendamento ativo: lotes de até 50, sem sobreposição, intervalo de 5 minutos após cada ciclo.');
}finally{await pool.end();}
