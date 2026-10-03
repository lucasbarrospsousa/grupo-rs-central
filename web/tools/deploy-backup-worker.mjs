import {loadDeploymentToken} from './deployment-token.mjs';
// Refresh only the existing worker code. Preserve credentials, schedules and policy.
import {readFile} from 'node:fs/promises';
import {privatePath} from '../backend/database.mjs';
const access=await loadDeploymentToken();
const form=new FormData();form.set('metadata',JSON.stringify({name:'central-backup',entrypoint_path:'index.ts',verify_jwt:false}));
form.append('file',new Blob([await readFile(new URL('../.sites-runtime/backup/index.ts',import.meta.url))],{type:'application/typescript'}),'index.ts');
const r=await fetch('https://api.supabase.com/v1/projects/vwiayytzmorcjeaszowg/functions/deploy?slug=central-backup',{method:'POST',headers:{Authorization:'Bearer '+access},body:form,signal:AbortSignal.timeout(120000)});
if(!r.ok)throw Error('Backup worker deployment failed: '+r.status);
const out=await r.json();console.log(JSON.stringify({slug:out.slug,status:out.status,version:out.version}));
