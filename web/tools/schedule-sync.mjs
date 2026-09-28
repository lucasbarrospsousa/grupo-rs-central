import {readFile} from 'node:fs/promises';
import {createPool,privatePath} from '../backend/database.mjs';
const pool=createPool({admin:true});
try{
 const token=(await readFile(privatePath('sync-token.txt'),'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(token))throw Error('Segredo de agendamento inválido.');
 await pool.query('CREATE EXTENSION IF NOT EXISTS pg_cron; CREATE EXTENSION IF NOT EXISTS pg_net;');
 const existing=(await pool.query("select id from vault.secrets where name='central_sync_token'")).rows[0];
 if(existing)await pool.query('select vault.update_secret($1,$2)',[existing.id,token]);else await pool.query('select vault.create_secret($1,$2,$3)',[token,'central_sync_token','Grupo RS Central: atualização automática somente leitura']);
 // The migration owns the dispatcher and protects settings from scheduler reinstalls.
 const version=Number((await pool.query('select max(version) version from central_homologacao.migrations')).rows[0].version);
 if(version<19)throw Error('Aplique a migração 019 antes de configurar o agendador.');
 await pool.query("select cron.schedule('central-background-sync','* * * * *','select central_homologacao.dispatch_sync()')");
 console.log('Agendador instalado; estado e intervalo existentes foram preservados.');
}finally{await pool.end();}
