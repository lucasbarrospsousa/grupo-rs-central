import {Buffer} from 'node:buffer';
import {backupStatus} from './backup-status.mjs';
import {userAccess,permitted,manageUsers} from './user-access.mjs';
import {integrationRoute} from './integration-routes.mjs';
import { randomUUID } from 'node:crypto';
import { hash, token, passwordMatches, passwordHash, session, cookies } from './auth.mjs';
import { businessMutation } from './business.mjs';
import { integrations } from './integrations.mjs';
const dummy=passwordHash('non-account-'+randomUUID());
const allowedFields=['serial','identification','plate','client','carrier','model','status','iccid','phone','apn','installed_at'];
const states=['Estoque','Reserva','Instalado','Manutenção','Inativos'];
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const fail=(status,message)=>Object.assign(Error(message),{status});
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>131072)throw fail(413,'Solicitação muito grande.');}try{return JSON.parse(raw||'{}');}catch{throw fail(400,'JSON inválido.');}}
export function api(pool,{integrationService=integrations}={}){return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith('/api/'))return false;
  try{
    const mutation=!['GET','HEAD'].includes(req.method);
    if(mutation&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)throw fail(403,'Origem inválida.');
    if(req.method==='POST'&&url.pathname==='/api/login'){
      const key=hash('login:'+String(req.socket.remoteAddress));
      const entry=(await pool.query(`insert into central_homologacao.login_limits(key_hash,attempts,until_at) values($1,1,now()+interval '1 minute') on conflict(key_hash) do update set attempts=case when login_limits.until_at<now() then 1 else login_limits.attempts+1 end,until_at=case when login_limits.until_at<now() then now()+interval '1 minute' else login_limits.until_at end returning attempts`,[key])).rows[0];
      if(entry.attempts>10)throw fail(429,'Aguarde um minuto antes de tentar novamente.');
      const b=await body(req);if(typeof b.username!=='string'||typeof b.password!=='string'||b.password.length>256)throw fail(400,'Informe usuário e senha.');
      const u=(await pool.query('select * from central_homologacao.users where username=$1 and active',[b.username.trim().toLowerCase()])).rows[0];
      if(!passwordMatches(b.password,u?.password_hash||dummy)||!u)throw fail(401,'Usuário ou senha inválidos.');
      if(u.password_hash.startsWith('legacy-sha256:'))await pool.query('update central_homologacao.users set password_hash=$2 where id=$1',[u.id,passwordHash(b.password)]);
      const sid=token(),csrf=hash(sid+':csrf');
      await pool.query(`insert into central_homologacao.sessions(token_hash,user_id,csrf_hash,expires_at) values($1,$2,$3,now()+$4::interval)`,[hash(sid),u.id,hash(csrf),b.remember?'30 days':'12 hours']);
      res.setHeader('Set-Cookie',`central_session=${sid}; HttpOnly; SameSite=Strict; Path=/${b.remember?'; Max-Age=2592000':''}${process.env.COOKIE_SECURE==='1'?'; Secure':''}`);
      reply(res,200,{csrf});return true;
    }
    const user=await session(pool,req);if(!user)throw fail(401,'Entre no sistema para continuar.');
    if(mutation&&hash(String(req.headers['x-csrf-token']||''))!==user.csrf_hash)throw fail(403,'Sessão de formulário inválida. Atualize a página.');
    if(url.pathname==='/api/session'&&req.method==='GET'){
      const permissions=await userAccess(pool,user);
      const memberships=(await pool.query('select m.branch_id as id,b.name,m.role from central_homologacao.memberships m join central_homologacao.branches b on b.id=m.branch_id where user_id=$1 order by b.name',[user.user_id])).rows;
      reply(res,200,{username:user.username,branches:memberships,permissions,lastActivityAt:user.last_activity_at,environment:'homologacao',csrf:hash(cookies(req).central_session+':csrf')});return true;
    }
    if(url.pathname==='/api/logout'&&req.method==='POST'){
      await pool.query('delete from central_homologacao.sessions where token_hash=$1',[hash(cookies(req).central_session)]);
      res.setHeader('Set-Cookie','central_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');reply(res,200,{ok:true});return true;
    }
    if(url.pathname==='/api/activity'&&req.method==='POST'){
      const updated=await pool.query("update central_homologacao.sessions set last_activity_at=now() where token_hash=$1 and last_activity_at>now()-interval '2 hours' and expires_at>now() returning last_activity_at",[hash(cookies(req).central_session)]);
      if(!updated.rowCount)throw fail(401,'Sessão expirada por inatividade.');
      reply(res,200,{lastActivityAt:updated.rows[0].last_activity_at});return true;
    }
    const permissions=await userAccess(pool,user);
    if(url.pathname==='/api/users'||/^\/api\/users\/[a-f0-9-]{36}$/.test(url.pathname)){if(!permissions.owner)throw fail(403,'Somente lucasabm pode administrar usuários.');reply(res,200,await manageUsers(pool,permissions,req.method,url.pathname.split('/')[3],req.method==='GET'?{}:await body(req)));return true;}
    if(!permitted(permissions,url.pathname,req.method))throw fail(403,'Seu usuário não tem permissão para esta operação.');
    if(mutation){const access=(await pool.query('select role from central_homologacao.memberships where user_id=$1 and branch_id=$2',[user.user_id,url.searchParams.get('branch')])).rows[0];if(!access||access.role==='reader')throw fail(403,'Usuário somente de consulta.');}
    if(url.pathname==='/api/backups/status'&&req.method==='GET'){reply(res,200,await backupStatus(pool,user.user_id));return true;}
    if(await integrationRoute({req,res,url,pool,user,readBody:body,service:integrationService}))return true;
    if(!['/api/install','/api/devices','/api/history','/api/warehouse','/api/warehouse-transfer','/api/bulk','/api/maintenance'].includes(url.pathname)&&!/^\/api\/(devices|warehouse|maintenance)\/[a-f0-9-]{36}$/.test(url.pathname))throw fail(404,'Recurso não encontrado.');
    const branch=url.searchParams.get('branch');
    const membership=(await pool.query('select role from central_homologacao.memberships where user_id=$1 and branch_id=$2',[user.user_id,branch])).rows[0];
    if(!membership)throw fail(403,'Sem acesso a esta filial.');
    const client=await pool.connect();
    try{
      await client.query('BEGIN');await client.query("select set_config('central.user_id',$1,true)",[user.user_id]);
      if(req.method==='GET'&&['/api/history','/api/warehouse'].includes(url.pathname)){
        const rows=url.pathname==='/api/history'?(await client.query('select source_id as id,source_table,branch_id,data from central_homologacao.legacy_records where branch_id=$1',[branch])).rows:
          (await client.query('select id,branch_id as branch,kind,serial,status,received_at,version from central_homologacao.warehouse_items where branch_id=$1 and deleted_at is null order by received_at desc',[branch])).rows;
        const movements=url.pathname==='/api/warehouse'?(await client.query('select id,destination,note,created_at,items from central_homologacao.warehouse_movements where branch_id=$1 order by created_at desc',[branch])).rows:[];
        const visits=url.pathname==='/api/history'?(await client.query('select id,branch_id as branch,data,version from central_homologacao.visits where branch_id=$1 order by created_at desc',[branch])).rows:[];
        await client.query('COMMIT');reply(res,200,{rows,movements,visits});return true;
      }
      if(req.method==='GET'){
        if(!url.pathname.startsWith('/api/devices'))throw fail(405,'Método não permitido.');
        const deviceId=url.pathname==='/api/devices'?null:url.pathname.split('/').at(-1);
        const rows=(await client.query('select d.id,d.serial,d.data,d.version,o.data as observation,o.checked_at from central_homologacao.devices d left join central_homologacao.device_observations o on o.device_id=d.id where d.branch_id=$1 and d.deleted_at is null and ($2::uuid is null or d.id=$2::uuid) order by d.serial',[branch,deviceId])).rows;
        if(deviceId&&!rows.length)throw fail(404,'Cadastro não encontrado.');
        await client.query('COMMIT');reply(res,200,{rows:rows.map(r=>({...r.data,id:r.id,serial:r.serial,branch,version:r.version,observation:r.observation,checked_at:r.checked_at}))});return true;
      }
      if(!['POST','PUT','PATCH','DELETE'].includes(req.method))throw fail(405,'Método não permitido.');
      if(membership.role==='reader')throw fail(403,'Usuário somente de leitura.');
      const b=await body(req), requestKey=req.headers['idempotency-key'];
      if(!/^[a-f0-9-]{36}$/.test(requestKey||''))throw fail(400,'Identificador da operação obrigatório.');
      const fingerprint=hash(JSON.stringify([req.method,url.pathname,branch,b]));
      await client.query('select pg_advisory_xact_lock(hashtext($1))',[user.user_id+requestKey]);
      const previous=(await client.query('select fingerprint,response from central_homologacao.requests where user_id=$1 and request_key=$2',[user.user_id,requestKey])).rows[0];
      if(previous){if(previous.fingerprint!==fingerprint)throw fail(409,'Identificador reutilizado para outra operação.');await client.query('COMMIT');reply(res,200,previous.response);return true;}
      if(!url.pathname.startsWith('/api/devices')){
        const result=await businessMutation(client,{service:integrationService,path:url.pathname,method:req.method,body:b,branch,user,role:membership.role});
        await client.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,req.method+' '+url.pathname,result.id,{count:result.response.count||1}]);
        await client.query('insert into central_homologacao.requests values($1,$2,$3,$4,now())',[user.user_id,requestKey,fingerprint,result.response]);
        await client.query('COMMIT');reply(res,200,result.response);return true;
      }
      const id=req.method==='POST'?randomUUID():url.pathname.split('/').at(-1);
      if(req.method!=='POST'&&url.pathname==='/api/devices')throw fail(405,'Informe o cadastro para esta operação.');
      if(req.method==='POST'&&url.pathname!=='/api/devices')throw fail(405,'Método não permitido.');
      const current=req.method==='POST'?null:(await client.query('select * from central_homologacao.devices where id=$1 and branch_id=$2 and deleted_at is null for update',[id,branch])).rows[0];
      if(req.method!=='POST'&&!current)throw fail(404,'Cadastro não encontrado.');
      if(current&&b.version!==current.version)throw fail(409,'Cadastro alterado por outra sessão. Atualize antes de salvar.');
      let data;
      if(req.method==='DELETE')await client.query('update central_homologacao.devices set deleted_at=now(),version=version+1,updated_at=now() where id=$1',[id]);
      else{
        const values=b.data;if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).some(k=>!allowedFields.includes(k)))throw fail(400,'Campos inválidos.');
        if(Object.values(values).some(v=>typeof v!=='string'||v.length>500))throw fail(400,'Valor inválido.');
        data=req.method==='PATCH'?{...current.data,...values}:{...values};
        if(Object.hasOwn(values,'iccid')&&values.iccid&&!/^89[0-9]{17,18}$/.test(values.iccid))throw fail(400,'ICCID deve ter 19 ou 20 dígitos e começar com 89.');
        if(Object.hasOwn(values,'phone')&&values.phone){const digits=values.phone.replace(/[^0-9]/g,'');if(!/^[0-9]{10,13}$/.test(digits))throw fail(400,'Telefone deve incluir DDD, com 10 a 13 dígitos.');data.phone=digits;}
        if(!/^\d{6,17}$/.test(data.serial||'')||!states.includes(data.status))throw fail(400,'Série ou situação inválida.');
        // Installation/discharge depends on verified platform binding, not free-form CRUD.
        if(data.status==='Instalado'&&(!current||current.data.status!=='Instalado'))throw fail(422,'Instalação exige conferência do vínculo na plataforma.');
        if(current&&data.serial!==current.serial)throw fail(422,'A série identifica o aparelho e não pode ser substituída nesta edição.');
        data.branch=branch;data.updated_at=new Date().toISOString();
        if(current)await client.query('update central_homologacao.devices set data=$2,version=version+1,updated_at=now() where id=$1',[id,data]);
        else await client.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,branch,data.serial,data]);
      }
      const response={ok:true,id,version:(current?.version||0)+1};
      await client.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,req.method,id,{beforeVersion:current?.version||0,afterVersion:response.version}]);
      await client.query('insert into central_homologacao.requests(user_id,request_key,fingerprint,response) values($1,$2,$3,$4)',[user.user_id,requestKey,fingerprint,response]);
      await client.query('COMMIT');reply(res,200,response);return true;
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }catch(e){if(e.code==='23514'&&e.message.startsWith('Chip já associado'))e=fail(409,'Chip já associado a outro aparelho. Confira a vinculação antes de salvar.');reply(res,e.status|| (e.code==='23505'?409:503),{error:e.status?e.message:e.code==='23505'?'Série já cadastrada nesta filial.':'Não foi possível concluir a operação. Tente novamente.'});return true;}
};}
