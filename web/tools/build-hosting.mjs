import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {mkdir,writeFile,copyFile,cp,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),stage=new URL('.sites-runtime/central/',root);
await mkdir(new URL('dist/server/',stage),{recursive:true});await mkdir(new URL('worker/',stage),{recursive:true});
await cp(new URL('public/',root),new URL('public/',stage),{recursive:true});
await copyFile(new URL('hosting/worker.mjs',root),new URL('worker/index.js',stage));
await writeFile(new URL('build.mjs',stage),`import {mkdir,cp,copyFile} from 'node:fs/promises';await mkdir('dist/server',{recursive:true});await cp('public','dist/client',{recursive:true});await copyFile('worker/index.js','dist/server/index.js');`);
await writeFile(new URL('package.json',stage),JSON.stringify({name:'grupo-rs-central-site',private:true,type:'module',scripts:{build:'node build.mjs'}},null,2));
await writeFile(new URL('.gitignore',stage),'dist/\n.sites-runtime/\n');
await mkdir(new URL('.sites-runtime/edge/',root),{recursive:true});
await build({entryPoints:[fileURLToPath(new URL('hosting/edge-entry.mjs',root))],outfile:fileURLToPath(new URL('.sites-runtime/edge/index.ts',root)),bundle:true,platform:'node',format:'esm',external:['node:*','npm:pg@8.23.0'],plugins:[{name:'edge-platform',setup(b){
 b.onResolve({filter:/^pg$/},()=>({path:'npm:pg@8.23.0',external:true}));
 b.onLoad({filter:/integration-secrets\.mjs$/},()=>({contents:`export function integrationSecrets(){const text=process.env.CENTRAL_INTEGRATIONS_JSON;if(!text)throw Error('Integrações indisponíveis.');return JSON.parse(text);}`,loader:'js'}));
 b.onLoad({filter:/database\.mjs$/},()=>({contents:`import pg from 'npm:pg@8.23.0';export function createPool(){return new pg.Pool({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,database:'postgres',user:process.env.CENTRAL_DB_USER,password:process.env.CENTRAL_DB_PASSWORD,ssl:{rejectUnauthorized:true,ca:process.env.CENTRAL_DB_CA},max:2,connectionTimeoutMillis:10000,idleTimeoutMillis:1000,statement_timeout:20000});}`,loader:'js'}));
 }}]});
console.log('Sources prepared: ChatGPT Site and Supabase API. No secrets included.');
