import pg from 'pg';
import {Buffer} from 'node:buffer';
import {timingSafeEqual} from 'node:crypto';
import {runBackup} from '../backend/backup-runner.mjs';
import {backupMigrations} from '../backend/backup-migrations.mjs';
export async function backupFetch(request){
 if(request.method==='GET'&&new URL(request.url).pathname.endsWith('/privacy'))return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Grupo RS Central Backups — Privacidade</title><main><h1>Grupo RS Central Backups</h1><p>Aplicativo de uso pessoal do administrador da Central para guardar e verificar cópias criptografadas do banco de dados em seu próprio Google Drive.</p><h2>Privacidade e acesso ao Google Drive</h2><p>O aplicativo solicita a permissão drive.file: acesso aos arquivos criados ou expressamente disponibilizados a ele. Consulta o e-mail da conta para confirmar o destinatário e as informações de espaço para acompanhar a capacidade disponível.</p><p>As cópias são criptografadas antes do envio. A rotina baixa cada cópia para verificar sua integridade e recuperação. Mantém cópias por 30 dias e preserva pelo menos as duas cópias verificadas mais recentes. Não compartilha os arquivos do Drive nem usa seu conteúdo para publicidade.</p><p>A autorização e a chave de recuperação ficam protegidas no servidor da Central; não são incluídas nas cópias do Drive. O painel mostra somente o estado, as datas, a quantidade de cópias e o espaço disponível.</p><p>O titular pode revogar o acesso nas permissões da Conta Google e excluir os arquivos em seu Drive. A revogação interrompe novos backups, mas não exclui cópias existentes. Contato: lucasbarrospereira13@gmail.com.</p><p>Atualizado em 24 de setembro de 2026.</p></main></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
 const expected=process.env.CENTRAL_BACKUP_TOKEN||'',actual=request.headers.get('x-central-backup')||'';
 const a=Buffer.from(actual),b=Buffer.from(expected);
 if(request.method!=='POST'||!expected||a.length!==b.length||!timingSafeEqual(a,b))return Response.json({error:'Acesso não autorizado.'},{status:401});
 let config;try{config=JSON.parse(process.env.CENTRAL_BACKUP_CONFIG||'null');}catch{}
 if(!config?.google||!config?.db||!process.env.CENTRAL_BACKUP_KEY)return Response.json({ok:false,error:'BACKUP_NOT_CONFIGURED'},{status:503});
 const pool=new pg.Pool({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,database:'postgres',user:config.db.user,password:config.db.password,ssl:{rejectUnauthorized:true,ca:process.env.CENTRAL_DB_CA},max:1,connectionTimeoutMillis:10000,idleTimeoutMillis:1000,statement_timeout:20000});
 try{const result=await runBackup(pool,{config:config.google,key:process.env.CENTRAL_BACKUP_KEY,migrations:backupMigrations});return Response.json(result,{status:result.ok===false?503:200});}
 catch{return Response.json({ok:false,error:'BACKUP_FAILED'},{status:503});}finally{await pool.end();}
}
if(import.meta.main)Deno.serve(backupFetch);
