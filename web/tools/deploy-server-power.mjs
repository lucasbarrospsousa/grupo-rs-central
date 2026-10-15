import {readFile} from 'node:fs/promises';import {loadDeploymentToken} from './deployment-token.mjs';
const token=await loadDeploymentToken();const form=new FormData();
form.set('metadata',JSON.stringify({name:'central-api',entrypoint_path:'index.ts',verify_jwt:false}));
form.set('file',new Blob([await readFile(new URL('../.sites-runtime/edge/index.ts',import.meta.url))],{type:'application/typescript'}),'index.ts');
const r=await fetch('https://api.supabase.com/v1/projects/vwiayytzmorcjeaszowg/functions/deploy?slug=central-api',{method:'POST',headers:{Authorization:'Bearer '+token},body:form,signal:AbortSignal.timeout(120000)});
if(!r.ok){await r.body?.cancel();throw Error('Central deployment HTTP '+r.status);}const d=await r.json();console.log({slug:d.slug,version:d.version,status:d.status});
