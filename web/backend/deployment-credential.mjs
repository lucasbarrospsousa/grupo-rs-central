const enc=new TextEncoder(),dec=new TextDecoder();
const fail=(status,message)=>Object.assign(Error(message),{status});
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const bytes=s=>Uint8Array.from(s.match(/../g)||[],x=>parseInt(x,16));
async function key(secret,project){if(!secret||secret.length<24)throw fail(503,'Armazenamento protegido indisponível.');return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',enc.encode('deployment-token:'+project+':'+secret)),'AES-GCM',false,['encrypt','decrypt']);}
export async function sealToken(token,secret,project){const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(project)},await key(secret,project),enc.encode(token));return hex(iv)+'.'+hex(new Uint8Array(cipher));}
export async function openToken(value,secret,project){const [iv,cipher]=value.split('.');return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:enc.encode(project)},await key(secret,project),bytes(cipher)));}
export async function validateDeploymentToken(token,project,request=fetch){
 if(typeof token!=='string'||!/^sbp_[a-zA-Z0-9]{20,200}$/.test(token))throw fail(400,'Informe um token de publicação Supabase válido.');
 for(const resource of ['functions','secrets']){
  let r;try{r=await request('https://api.supabase.com/v1/projects/'+project+'/'+resource,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw fail(502,'Não foi possível validar no Supabase. A credencial anterior foi preservada.');}
  await r.body?.cancel();
  if(!r.ok)throw fail(r.status===401||r.status===403?400:502,r.status===401?'Token recusado ou expirado.':r.status===403?'Token sem acesso ao projeto ou às funções e segredos. Confira o projeto e as permissões.':'Supabase indisponível. A credencial anterior foi preservada.');
 }
}
export const CENTRAL_PROJECT='vwiayytzmorcjeaszowg';
export async function centralTokenStatus(pool){const r=(await pool.query('select updated_at from central_homologacao.deployment_credential where id=true')).rows[0];return{configured:!!r,updatedAt:r?.updated_at||null};}
export async function saveCentralToken(pool,token,secret){await validateDeploymentToken(token,CENTRAL_PROJECT);const encrypted=await sealToken(token,secret,CENTRAL_PROJECT);await pool.query('insert into central_homologacao.deployment_credential(id,encrypted,updated_at) values(true,$1,now()) on conflict(id) do update set encrypted=excluded.encrypted,updated_at=excluded.updated_at',[encrypted]);return{ok:true,...await centralTokenStatus(pool)};}
