import {driveUsers} from './drive.mjs';
import {decryptUsers,digest,randomToken,passwordMatches} from './auth-crypto.mjs';
const lifetime=12*60*60*1000,idle=2*60*60*1000;
const cookie=value=>`parallel_drive_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/`;
const reply=(status,data,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
export class AuthService {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async users(){return decryptUsers(await driveUsers(JSON.parse(this.env.DRIVE_CONFIG||'null')),this.env.AUTH_DATA_KEY);}
 async attempt(ip,username,now){
  return this.ctx.storage.transaction(async store=>{
   let allowed=true;
   for(const scope of ['ip:'+ip,'user:'+username]){const name='rate:'+digest(scope);let value=await store.get(name);if(!value||value.expires<=now)value={attempts:0,expires:now+60000};value.attempts++;await store.put(name,value);if(value.attempts>10)allowed=false;}
   return allowed;
  });
 }
 async alarm(){const now=Date.now();let startAfter;do{const rows=await this.ctx.storage.list({limit:500,...(startAfter?{startAfter}:{})});if(!rows.size)break;const expired=[];for(const [key,value]of rows){startAfter=key;if(value.expires<=now||(key.startsWith('session:')&&value.lastActivity+idle<=now))expired.push(key);}if(expired.length)await this.ctx.storage.delete(expired);if(rows.size<500)break;}while(true);await this.ctx.storage.setAlarm(now+3600000);}
 async fetch(request){
  try{
   const path=new URL(request.url).pathname,now=Date.now();
   if(!await this.ctx.storage.getAlarm())await this.ctx.storage.setAlarm(now+3600000);
   if(path==='/api/login'&&request.method==='POST'){
    let b;try{b=await request.json();}catch{return reply(400,{error:'JSON inválido.'});}
    if(!b||typeof b.username!=='string'||!b.username.trim()||b.username.length>120||typeof b.password!=='string'||!b.password||b.password.length>256)return reply(400,{error:'Informe usuário e senha.'});
    const username=b.username.trim().toLowerCase();
    if(!await this.attempt(request.headers.get('x-parallel-ip')||'unknown',username,now))return reply(429,{error:'Aguarde um minuto antes de tentar novamente.'},{'Retry-After':'60'});
    const data=await this.users(),user=data.users.find(u=>u.username===username);
    const valid=passwordMatches(b.password,user?.password_hash);b.password='';
    if(!valid||!user?.active)return reply(401,{error:'Usuário ou senha inválidos.'});
    const sid=randomToken(),csrf=randomToken();
    await this.ctx.storage.put('session:'+digest(sid),{userId:user.id,userVersion:digest(JSON.stringify(user)),csrf,expires:now+lifetime,lastActivity:now});
    return reply(200,{csrf},{'Set-Cookie':cookie(sid)});
   }
   const sid=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>/^parallel_drive_session=[a-f0-9]{64}$/.test(x))?.split('=')[1];
   if(!sid)return reply(401,{error:'Entre no sistema para continuar.'});
   const name='session:'+digest(sid),s=await this.ctx.storage.get(name);
   if(!s||s.expires<=now||s.lastActivity+idle<=now){if(s)await this.ctx.storage.delete(name);return reply(401,{error:'Sessão expirada.'});}
   if(path==='/api/logout'&&request.method==='POST'){
    if(digest(request.headers.get('x-csrf-token')||'')!==digest(s.csrf))return reply(403,{error:'Sessão de formulário inválida.'});
    await this.ctx.storage.delete(name);return reply(200,{ok:true},{'Set-Cookie':cookie('')+'; Max-Age=0'});
   }
   if(path!=='/api/session'||request.method!=='GET')return reply(404,{error:'Recurso não disponível.'});
   const data=await this.users(),user=data.users.find(u=>u.id===s.userId);
   if(!user?.active||digest(JSON.stringify(user))!==s.userVersion){await this.ctx.storage.delete(name);return reply(401,{error:'Acesso alterado. Entre novamente.'});}
   // Transaction prevents a concurrent logout from being undone by a read.
   const alive=await this.ctx.storage.transaction(async store=>{const current=await store.get(name);if(!current)return false;await store.put(name,{...current,lastActivity:now});return true;});
   if(!alive)return reply(401,{error:'Sessão encerrada.'});
   return reply(200,{username:user.username,branches:user.branches,permissions:user.permissions,csrf:s.csrf,lastActivityAt:new Date(now).toISOString(),environment:'drive-experimental'});
  }catch{return reply(503,{error:'Autenticação do Drive indisponível. Tente novamente.'});}
 }
}
