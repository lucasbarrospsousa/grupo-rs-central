import {scryptSync} from 'node:crypto';
import {digest,randomToken} from './auth-crypto.mjs';
export const modules=['overview','stock','maintenance','warehouse','sms','tracking','records','route','link','bulk','settings','logs'];
export const writable=['stock','maintenance','warehouse','sms','link','bulk'];
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export const publicUser=u=>({id:u.id,username:u.username,active:u.active,branches:u.branches,permissions:u.permissions,version:digest(JSON.stringify(u))});
export function editUser(data,actor,b){
 if(!actor?.active||!actor.permissions?.owner)fail(403,'Somente o administrador principal.');
 const existing=b.id?data.users.find(u=>u.id===b.id):null;
 if(b.id&&!existing)fail(404,'Usuário não encontrado.');
 if(existing?.permissions?.owner)fail(403,'Administrador principal protegido.');
 if(existing&&b.version!==digest(JSON.stringify(existing)))fail(409,'Usuário alterado. Reabra o cadastro.');
 const username=existing?.username||String(b.username||'').trim().toLowerCase();
 if(!/^[a-z0-9._-]{3,40}$/.test(username)||username.startsWith('service-'))fail(400,'Nome de usuário inválido.');
 if(!existing&&data.users.some(u=>u.username===username))fail(409,'Usuário já cadastrado.');
 if(typeof b.active!=='boolean'||!Array.isArray(b.views)||!b.views.length||b.views.some(x=>!modules.includes(x))||!Array.isArray(b.writes)||b.writes.some(x=>!b.views.includes(x)||!writable.includes(x)))fail(400,'Permissões inválidas.');
 if(!Array.isArray(b.branches)||!b.branches.length||b.branches.some(id=>!actor.branches.some(x=>x.id===id)))fail(403,'Filiais não autorizadas.');
 if((!existing||b.password)&&(typeof b.password!=='string'||b.password.length<8||b.password.length>128))fail(400,'Senha: 8 a 128 caracteres.');
 let password_hash=existing?.password_hash;
 if(b.password){const salt=randomToken();password_hash=salt+':'+scryptSync(b.password,salt,64).toString('hex');}
 const next={...existing,id:existing?.id||crypto.randomUUID(),username,active:b.active,password_hash,branches:b.branches.map(id=>({...actor.branches.find(x=>x.id===id),role:b.writes.length?'operator':'reader'})),permissions:{...existing?.permissions,owner:false,views:[...new Set(b.views)],writes:[...new Set(b.writes)]}};
 if(existing)data.users[data.users.indexOf(existing)]=next;else data.users.push(next);
 data.audit??=[];data.audit.push({at:new Date().toISOString(),actor:actor.username,target:next.id,action:existing?'edit':'create'});
 return publicUser(next);
}
