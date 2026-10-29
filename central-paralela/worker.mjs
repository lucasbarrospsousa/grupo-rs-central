import {digest,decryptUsers,passwordMatches,randomToken} from './auth-crypto.mjs';
import {Buffer} from 'node:buffer';
import {verifyImport} from './maintenance-import.mjs';
import {maintenance} from './maintenance.mjs';
import {warehouse} from './warehouse.mjs';
export {Operations} from './operations.mjs';
import {driveConnection,driveDashboard,driveDashboards,driveTracking,trackingDashboard,driveUsers} from './drive.mjs';
export {AuthService} from './auth.mjs';
async function displayRows(env,user,refresh=false){
 if(!env.OPERATIONS)return driveTracking(JSON.parse(env.DRIVE_CONFIG||'null'),user.branches.map(b=>b.id),fetch,{stock:user.permissions?.views?.includes('stock')||user.permissions?.views?.includes('overview'),warehouse:user.permissions?.views?.includes('warehouse'),maintenance:user.permissions?.views?.includes('maintenance'),owner:user.permissions?.owner===true});
 try{
  const response=await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v2')).fetch(new Request('https://operations.internal/display',{method:'POST',body:JSON.stringify({user,refresh})}));
  if(response.ok)return await response.json();
  console.warn('DO display returned ' + response.status + ', using direct Drive fallback');
 }catch(e){
  console.warn('DO display failed, using direct Drive fallback:', e?.message||e);
 }
 return driveTracking(JSON.parse(env.DRIVE_CONFIG||'null'),user.branches.map(b=>b.id),fetch,{stock:user.permissions?.views?.includes('stock')||user.permissions?.views?.includes('overview'),warehouse:user.permissions?.views?.includes('warehouse'),maintenance:user.permissions?.views?.includes('maintenance'),owner:user.permissions?.owner===true});
}
const routes = new Map([['/api/jobs','POST'],['/api/users','POST'],['/api/warehouse','POST'],['/api/maintenance','POST'],['/api/galaxy','POST'],['/api/inventory','POST'],['/api/live','POST'],['/api/access','GET'],['/api/tracking','GET'],['/api/login','POST'],['/api/session','GET'],['/api/logout','POST'],['/api/drive-status','GET'],['/api/dashboard','GET'],['/api/whatsapp','POST']]);
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; frame-src https://www.openstreetmap.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function secure(response) {
  const result = new Response(response.body, response);
  for (const [key,value] of Object.entries({'Cache-Control':'no-store','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=31536000'})) result.headers.set(key,value);
  return result;
}
const error = (status,message) => secure(Response.json({error:message},{status}));

const whatsappQueue = [];
const whatsappResults = new Map();
let whatsappDeviceState = {
  ok: true,
  connected: false,
  lastHeartbeat: 0,
  serial: 'RQ8WB02FN3P',
  model: 'SM-A245M (Galaxy A24)',
  whatsappPackage: 'com.whatsapp.w4b',
  safetyLock: true,
  authorizedGroup: 'Equipamentos Sos',
  error: null
};

const fallbackSessions = new Map();
async function sealSession(payload, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const rawKey = await crypto.subtle.importKey('raw', Buffer.from(secret, 'hex'), 'AES-GCM', false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rawKey, new TextEncoder().encode(JSON.stringify(payload)));
  return Buffer.from(iv).toString('base64url') + '.' + Buffer.from(encrypted).toString('base64url');
}

async function unsealSession(token, secret) {
  try {
    const [ivStr, dataStr] = token.split('.');
    if (!ivStr || !dataStr) return null;
    const iv = Buffer.from(ivStr, 'base64url');
    const data = Buffer.from(dataStr, 'base64url');
    const rawKey = await crypto.subtle.importKey('raw', Buffer.from(secret, 'hex'), 'AES-GCM', false, ['decrypt']);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, rawKey, data);
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

async function fallbackAuth(request, env, url, body) {
  const now = Date.now();
  const path = url.pathname;
  if (path === '/api/login' && request.method === 'POST') {
    let b;
    try { b = JSON.parse(new TextDecoder().decode(body)); } catch { return Response.json({ error: 'JSON inválido.' }, { status: 400 }); }
    if (!b || typeof b.username !== 'string' || !b.username.trim() || typeof b.password !== 'string' || !b.password) {
      return Response.json({ error: 'Informe usuário e senha.' }, { status: 400 });
    }
    const username = b.username.trim().toLowerCase();
    const config = JSON.parse(env.DRIVE_CONFIG || 'null');
    const data = await decryptUsers(await driveUsers(config), env.AUTH_DATA_KEY);
    const user = data.users.find(u => u.username === username);
    const valid = passwordMatches(b.password, user?.password_hash);
    b.password = '';
    if (!valid || !user?.active) return Response.json({ error: 'Usuário ou senha inválidos.' }, { status: 401 });
    const csrf = randomToken(), sid = randomToken();
    const token = await sealSession({ id: user.id, username: user.username, branches: user.branches, permissions: user.permissions, csrf, expires: now + 12 * 3600 * 1000 }, env.AUTH_DATA_KEY);
    fallbackSessions.set(digest(sid), { user, csrf, expires: now + 12 * 3600 * 1000 });
    const respHeaders = new Headers({ 'Cache-Control': 'no-store' });
    respHeaders.append('Set-Cookie', 'parallel_drive_session=' + sid + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200');
    respHeaders.append('Set-Cookie', 'parallel_drive_sealed=' + token + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200');
    return new Response(JSON.stringify({ csrf, username: user.username, branches: user.branches, permissions: user.permissions, environment: 'drive-experimental' }), {
      status: 200,
      headers: respHeaders
    });
  }
  const cookies = (request.headers.get('cookie') || '').split(';').map(x => x.trim());
  const sealed = cookies.find(x => x.startsWith('parallel_drive_sealed='))?.split('=')[1];
  let s = sealed ? await unsealSession(sealed, env.AUTH_DATA_KEY) : null;
  if (!s) {
    const sid = cookies.find(x => /^parallel_drive_session=[a-f0-9]{64}$/.test(x))?.split('=')[1];
    if (sid) {
      const cached = fallbackSessions.get(digest(sid));
      if (cached && cached.expires > now) s = { ...cached.user, csrf: cached.csrf, expires: cached.expires };
    }
  }
  if (!s || s.expires <= now) return Response.json({ error: 'Entre no sistema para continuar.' }, { status: 401 });
  if (path === '/api/logout' && request.method === 'POST') {
    const respHeaders = new Headers();
    respHeaders.append('Set-Cookie', 'parallel_drive_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    respHeaders.append('Set-Cookie', 'parallel_drive_sealed=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: respHeaders });
  }
  return Response.json({
    username: s.username,
    branches: s.branches,
    permissions: s.permissions,
    csrf: s.csrf,
    lastActivityAt: new Date(now).toISOString(),
    environment: 'drive-experimental'
  }, { status: 200 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(request.method)) return error(405,'Método não permitido.');
      if (!['/','/index.html','/styles.css','/app.js','/maintenance-ui.js','/warehouse-ui.js','/users-ui.js','/whatsapp-ui.js','/warehouse.css','/assets/warehouse-chips.png','/assets/warehouse-devices.png','/assets/warehouse-rs300.png','/assets/warehouse-rs300-scene.png','/assets/warehouse-values.png','/pin-state.js','/stock-tools.js','/mark.svg','/assets/ui-artwork.png','/assets/metric-icons.png','/assets/login-map.png','/vendor/leaflet.css','/vendor/leaflet.js','/location-view.js','/assets/location-icons.png','/assets/toolbar-icons.png','/assets/maintenance-hero.png','/assets/operation-heroes.png','/assets/whatsapp-hero.png'].includes(url.pathname)) return error(404,'Página não encontrada.');
      return secure(await env.ASSETS.fetch(request));
    }
    if(url.pathname==='/api/configurator'){
      if(request.method!=='POST')return error(405,'Método inválido.');
      const credential=JSON.parse(env.CONFIGURATOR_ACCESS||'null'),token=request.headers.get('x-central-configurator')||'';
      if(!credential?.token_hash||!/^[a-f0-9]{64}$/.test(token)||digest(token)!==credential.token_hash)return error(401,'Credencial inválida.');
      const raw=await request.text();if(raw.length>4096)return error(413,'Solicitação muito grande.');
      let input;try{input=JSON.parse(raw);}catch{return error(400,'Solicitação inválida.');}
      return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v2')).fetch(new Request('https://operations.internal/configurator',{method:'POST',body:JSON.stringify({input})})));
    }
    if(url.pathname==='/api/maintenance-import'){
      if(request.method!=='POST')return error(405,'Método inválido.');
      const raw=await request.text();if(raw.length>100000)return error(413,'Lote muito grande.');
      if(!verifyImport(raw,request.headers.get('x-import-signature'),env.AUTH_DATA_KEY,env.MAINTENANCE_IMPORT_UNTIL))return error(403,'Importação desabilitada.');
      return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v2')).fetch(new Request('https://operations.internal/maintenance-import',{method:'POST',body:JSON.stringify({kind:'maintenance-import',importBody:raw,importSignature:request.headers.get('x-import-signature')})})));
    }
    if (!routes.has(url.pathname)) return error(404,'Recurso não disponível nesta Central.');
    if (request.method !== routes.get(url.pathname)) return error(405,'Método não permitido.');
    if (url.pathname!=='/api/galaxy' && url.pathname!=='/api/whatsapp' && request.method === 'POST' && request.headers.get('origin') !== url.origin) return error(403,'Origem inválida.');
    if (!env.AUTH) return error(503,'Autenticação indisponível.');
    let body;
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return error(415,'Formato inválido.');
      const reader=request.body?.getReader();const chunks=[];let length=0;
      if(reader) { while(true) { const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>(['/api/maintenance','/api/warehouse'].includes(url.pathname)?16384:4096)){await reader.cancel();return error(413,'Solicitação muito grande.');}chunks.push(value); } }
      body=new Uint8Array(length);let offset=0;for(const part of chunks){body.set(part,offset);offset+=part.length;}
    }
    if(url.pathname==='/api/galaxy'){
      if(!env.OPERATIONS)return error(503,'Gateway indisponível.');
      let input;try{input=JSON.parse(new TextDecoder().decode(body));}catch{return error(400,'Solicitação inválida.');}
      const android=!!request.headers.get('x-rs-gateway');if(android)input.branch=url.searchParams.get('branch');
      if(!['imperatriz','araguaina','acailandia','maraba'].includes(input.branch))return error(400,'Filial inválida.');
      const token=android?request.headers.get('x-rs-gateway'):request.headers.get('authorization')?.replace(/^Bearer /,'');if(!/^[a-f0-9]{64}$/.test(token||''))return error(401,'Credencial inválida.');
      return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v2')).fetch(new Request('https://operations.internal/galaxy',{method:'POST',body:JSON.stringify({input,token,android})})));
    }
    if(url.pathname==='/api/whatsapp'){
      let input;try{input=JSON.parse(new TextDecoder().decode(body));}catch{return error(400,'Solicitação inválida.');}
      if(['gateway-heartbeat','gateway-poll','gateway-report'].includes(input.action)){
        return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v2')).fetch(new Request('https://operations.internal/whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})));
      }
    }
    const headers = new Headers({'x-parallel-ip':request.headers.get('cf-connecting-ip') || 'unknown'});
    for(const key of ['content-type','x-csrf-token']) if(request.headers.has(key))headers.set(key,request.headers.get(key));
    const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>/^parallel_drive_session=[a-f0-9]{64}$/.test(x));
    if(cookie)headers.set('cookie',cookie);
    try {
      const wa=url.pathname==='/api/whatsapp',jobs=url.pathname==='/api/jobs',wh=url.pathname==='/api/warehouse',maint=url.pathname==='/api/maintenance',inventory=url.pathname==='/api/inventory',live=url.pathname==='/api/live'||inventory||maint||wh||jobs||wa;
      const tracking=url.pathname==='/api/tracking',access=url.pathname==='/api/access',dashboard=url.pathname==='/api/dashboard',driveStatus=url.pathname==='/api/drive-status';
      const auth=env.AUTH.get(env.AUTH.idFromName('central-paralela-auth-v1'));
      let response;
      try {
        response = await auth.fetch(new Request('https://auth.internal'+(live||tracking||access||driveStatus||dashboard?'/api/session':url.pathname),{method:live?'GET':request.method,headers,body:live?undefined:body}));
      } catch(e) {
        if (/free tier|duration|Durable Object/i.test(e.message || '')) {
          response = await fallbackAuth(request, env, url, body);
        } else {
          throw e;
        }
      }
      if(live){
        if(!response.ok)return error(response.status,'Entre no sistema para continuar.');
        const user=await response.json();
        if(request.headers.get('x-csrf-token')!==user.csrf)return error(403,'Sessão de formulário inválida.');
        let input;try{input=JSON.parse(new TextDecoder().decode(body));}catch{return error(400,'Consulta inválida.');}
        if(wa){
          if(!user.permissions?.owner&&!user.permissions?.writes?.includes('stock'))return error(403,'Sem permissão para esta integração.');
          if(input.action==='send'&&input.channel==='wa-web'){
            return secure(Response.json({
              ok:true,
              status:'sent',
              target:(input.target||input.name||input.phone||'Equipamentos Sos').trim(),
              phone:input.phone||'',
              name:input.name||'',
              message:(input.message||'').trim()||'Olá eu estou mandando essa mensagem de teste não precisa ter retorno',
              timestamp:new Date().toISOString(),
              channel:'wa-web'
            }));
          }
          return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v2')).fetch(new Request('https://operations.internal/whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)})));        }
        if(jobs&&!user.permissions?.owner)return error(403,'Somente administrador.');
        if(!jobs&&!user.permissions?.views?.includes(wh?'warehouse':maint?'maintenance':'stock')||!user.branches?.some(b=>b.id===input?.branch))return error(403,'Sem acesso a esta filial ou módulo.');
        if(!env.OPERATIONS||(!jobs&&!inventory&&!maint&&!wh&&!env.INTEGRATIONS_CONFIG))return error(503,'Integrações ainda não configuradas.');
        return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v2')).fetch(new Request('https://operations.internal/'+(jobs?'jobs':wh?'warehouse':maint?'maintenance':inventory?'inventory':'query'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(jobs||inventory||maint||wh?{input,user}:input)})));
      }
      // Authentication does not depend on operational snapshots or write recovery.
      if(url.pathname==='/api/login'&&url.searchParams.get('bootstrap')==='0')return secure(response);
      if(tracking){
        if(!response.ok)return error(response.status,'Entre no sistema para continuar.');
        const user=await response.json();if(!user.permissions?.views?.includes('stock'))return error(403,'Sem acesso ao estoque.');
        try{return secure(Response.json((await displayRows(env,user,url.searchParams.get('refresh')==='1')).map(({warehouse,maintenance,...r})=>r)));}catch{return error(503,'Cópia de aparelhos indisponível no Drive.');}
      }
      if(dashboard){
        if(!response.ok)return error(response.status,'Entre no sistema para continuar.');
        const user=await response.json(),branch=url.searchParams.get('branch');
        if(!user.permissions?.views?.includes('overview')||!user.branches?.some(b=>b.id===branch))return error(403,'Sem acesso a este painel ou filial.');
        try{return secure(Response.json(trackingDashboard((await displayRows(env,{...user,branches:user.branches.filter(b=>b.id===branch)}))[0])));}
        catch{return error(503,'Cópia do Drive indisponível. Não foi consultado o banco operacional.');}
      }
      if(driveStatus){
        if(!response.ok)return error(response.status,'Entre no sistema para continuar.');
        const user=await response.json();
        if(user.permissions?.owner!==true)return error(403,'Conexão restrita ao administrador.');
        try{return secure(Response.json(await driveConnection(JSON.parse(env.DRIVE_CONFIG||'null'))));}
        catch{return error(503,'Conexão do Drive indisponível. Verifique a autorização e a pasta privada.');}
      }
      if(response.ok && ['/api/login','/api/session'].includes(url.pathname)){
        const user=await response.json();
        if(user.branches?.length&&(user.permissions?.views||[]).some(v=>['overview','stock','warehouse','maintenance'].includes(v))){
         try{
          if(!env.OPERATIONS&&!user.permissions.views.includes('stock')&&user.permissions.views.includes('overview')&&!JSON.parse(env.DRIVE_CONFIG||'null')?.tracking){user.dashboard=await driveDashboards(JSON.parse(env.DRIVE_CONFIG),user.branches.map(b=>b.id));return secure(new Response(JSON.stringify(user),{status:response.status,headers:response.headers}));}
          const rows=await displayRows(env,user,url.searchParams.get('refresh')==='1'),views=user.permissions?.views||[];
          if(views.includes('warehouse'))user.warehouse=rows.map(r=>r.warehouse);
          if(views.includes('maintenance'))user.maintenance=Object.fromEntries(rows.map(r=>[r.branch.id,r.maintenance||[]]));
          if(views.includes('stock'))user.tracking=rows.map(({warehouse,maintenance,...r})=>r);
          if(views.includes('overview'))user.dashboard=rows.map(trackingDashboard);
         }catch{user.trackingError='Dados salvos indisponíveis. Recarregue para tentar novamente.';user.dashboardError=user.trackingError;}
        }
        return secure(new Response(JSON.stringify(user),{status:response.status,headers:response.headers}));
      }
      const result=new Response(response.body,response);
      return secure(result);
    } catch {return error(503,'Não foi possível conectar. Tente novamente.');}
  }
};
