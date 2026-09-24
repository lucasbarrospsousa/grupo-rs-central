import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {privatePath} from '../backend/database.mjs';
import {integrationSecrets} from '../backend/integration-secrets.mjs';
const access=(await readFile(privatePath('supabase-access-token.txt'),'utf8')).trim();
if(!/^sbp_[A-Za-z0-9]+$/.test(access))throw Error('Token de acesso Supabase inválido.');
const runtime=JSON.parse(await readFile(privatePath('runtime-db.json'),'utf8'));
let bridge;try{bridge=(await readFile(privatePath('bridge-token.txt'),'utf8')).trim();}catch{bridge=randomBytes(32).toString('hex');await writeFile(privatePath('bridge-token.txt'),bridge,{mode:0o600});}
let sync;try{sync=(await readFile(privatePath('sync-token.txt'),'utf8')).trim();}catch{sync=randomBytes(32).toString('hex');await writeFile(privatePath('sync-token.txt'),sync,{mode:0o600});}
const base='https://api.supabase.com/v1/projects/vwiayytzmorcjeaszowg';
const values={CENTRAL_SYNC_TOKEN:sync,CENTRAL_DB_USER:runtime.user,CENTRAL_DB_PASSWORD:runtime.password,CENTRAL_DB_CA:await readFile(privatePath('supabase-ca.crt'),'utf8'),CENTRAL_INTEGRATIONS_JSON:JSON.stringify(integrationSecrets()),CENTRAL_BRIDGE_TOKEN:bridge,CENTRAL_PUBLIC_ORIGIN:'https://grupo-rs-central.lucasbarrosp.chatgpt.site',COOKIE_SECURE:'1'};
try{const config=JSON.parse(await readFile(privatePath('configurator-access.json'),'utf8'));values.CENTRAL_CONFIGURATOR_TOKEN=config.token;values.CENTRAL_CONFIGURATOR_USER=config.user_id;}catch(e){if(e.code!=='ENOENT')throw e;}
const secrets=await fetch(base+'/secrets',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(Object.entries(values).map(([name,value])=>({name,value}))),signal:AbortSignal.timeout(30000)});
if(!secrets.ok)throw Error('Supabase não aceitou a configuração protegida. HTTP '+secrets.status);
const form=new FormData();form.set('metadata',JSON.stringify({name:'central-api',entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([await readFile(new URL('../.sites-runtime/edge/index.ts',import.meta.url))],{type:'application/typescript'}),'index.ts');
const result=await fetch(base+'/functions/deploy?slug=central-api',{method:'POST',headers:{Authorization:'Bearer '+access},body:form,signal:AbortSignal.timeout(120000)});
if(!result.ok)throw Error('Publicação da API falhou. HTTP '+result.status);const out=await result.json();console.log(JSON.stringify({slug:out.slug,status:out.status,version:out.version}));
