import {randomUUID} from 'node:crypto';
import {passwordHash} from './auth.mjs';
export const MODULES=['overview','stock','maintenance','warehouse','tracking','records','route','sms','link','bulk','settings'];
export const WRITABLE=['stock','maintenance','warehouse','sms','link','bulk'];
const fail=(status,message)=>Object.assign(Error(message),{status});
export async function userAccess(pool,user){
 const owner=user.username==='lucasabm'&&(await pool.query("select 1 from central_homologacao.memberships where user_id=$1 and role='admin' limit 1",[user.user_id])).rowCount>0;
 if(owner)return {owner:true,views:MODULES,writes:WRITABLE};
 const saved=(await pool.query('select views,writes from central_homologacao.user_permissions where user_id=$1',[user.user_id])).rows[0];
 return {owner:false,views:saved?.views||MODULES.filter(m=>!['link','bulk','settings'].includes(m)),writes:saved?.writes||[]};
}
export function permitted(access,path,method){
 if(access.owner)return true;
 const p=path.replace(/^\/api\//,'').split('/')[0],action=path.split('/').at(-1),write=!['GET','HEAD'].includes(method);
 if(p==='backups'||p==='users')return false;
 const modules=p==='devices'?['stock','overview','tracking','records','route','link','bulk','maintenance']:p==='history'?['maintenance']:p==='warehouse'||p==='warehouse-transfer'?['warehouse']:p==='maintenance'?['maintenance']:p==='install'?['stock']:p==='bulk'?['bulk']:p==='integrations'?(write?[{sms:'sms',link:'link',reconcile:'link',discharge:'stock'}[action]]:action==='sync-status'?MODULES:action==='operations'||action==='gateway'||action==='sms-template'?['sms']:action==='maintenance'?['overview']:action==='status'?['settings']:['stock','tracking','records','route','link','bulk','warehouse','maintenance']):[];
 return (write&&p==='devices'?['stock']:modules).some(m=>(write?access.writes:access.views).includes(m));
}
export async function manageUsers(pool,access,method,id,body){
 if(!access.owner)throw fail(403,'Somente lucasabm pode administrar usuários.');
 if(method==='GET')return {users:(await pool.query("select u.id,u.username,u.active,coalesce(p.views,$1::text[]) as views,coalesce(p.writes,'{}'::text[]) as writes from central_homologacao.users u left join central_homologacao.user_permissions p on p.user_id=u.id where u.username not like 'service-%' order by u.username",[MODULES.filter(m=>!['link','bulk','settings'].includes(m))])).rows,modules:MODULES,writable:WRITABLE};
 if(!['POST','PATCH'].includes(method))throw fail(405,'Método não permitido.');
 const username=String(body.username||'').trim().toLowerCase(),{views,writes}=body;
 if(!Array.isArray(views)||!views.length||views.some(m=>!MODULES.includes(m))||!Array.isArray(writes)||writes.some(m=>!WRITABLE.includes(m)||!views.includes(m)))throw fail(400,'Revise os módulos e permissões.');
 if(typeof body.active!=='boolean')throw fail(400,'Informe se o usuário está ativo.');
 if((method==='POST'||body.password)&& (typeof body.password!=='string'||body.password.length<8||body.password.length>128))throw fail(400,'A senha deve ter entre 8 e 128 caracteres.');
 if(method==='POST'&&!/^[a-z0-9._-]{3,40}$/.test(username))throw fail(400,'Usuário: 3 a 40 letras, números, ponto, hífen ou sublinhado.');
 const c=await pool.connect();try{await c.query('BEGIN');
  if(method==='PATCH'){const target=(await c.query('select username from central_homologacao.users where id=$1 for update',[id])).rows[0];if(!target)throw fail(404,'Usuário não encontrado.');if(target.username==='lucasabm'||target.username.startsWith('service-'))throw fail(403,'O administrador principal é protegido.');await c.query('update central_homologacao.users set active=$2 where id=$1',[id,body.active]);if(body.password)await c.query('update central_homologacao.users set password_hash=$2 where id=$1',[id,passwordHash(body.password)]);
  }else{id=randomUUID();if(username==='lucasabm'||username.startsWith('service-'))throw fail(403,'Administrador protegido.');await c.query('insert into central_homologacao.users(id,username,password_hash,active) values($1,$2,$3,$4)',[id,username,passwordHash(body.password),body.active]);}
  await c.query('insert into central_homologacao.user_permissions(user_id,views,writes) values($1,$2,$3) on conflict(user_id) do update set views=excluded.views,writes=excluded.writes',[id,[...new Set(views)],[...new Set(writes)]]);
  await c.query("insert into central_homologacao.memberships(user_id,branch_id,role) select $1,id,$2 from central_homologacao.branches on conflict(user_id,branch_id) do update set role=excluded.role",[id,writes.includes('warehouse')?'admin':writes.length?'operator':'reader']);
  await c.query('delete from central_homologacao.sessions where user_id=$1',[id]);await c.query('COMMIT');return{ok:true,id};
 }catch(e){await c.query('ROLLBACK');if(e.code==='23505')throw fail(409,'Esse usuário já existe.');throw e;}finally{c.release();}
}
