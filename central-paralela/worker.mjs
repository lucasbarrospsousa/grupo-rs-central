import {digest} from './auth-crypto.mjs';
import {verifyImport} from './maintenance-import.mjs';
export {Operations} from './operations.mjs';
import {driveConnection,driveDashboard,driveDashboards,driveTracking,trackingDashboard} from './drive.mjs';
export {AuthService} from './auth.mjs';
const routes = new Map([['/api/jobs','POST'],['/api/users','POST'],['/api/warehouse','POST'],['/api/maintenance','POST'],['/api/galaxy','POST'],['/api/inventory','POST'],['/api/live','POST'],['/api/access','GET'],['/api/tracking','GET'],['/api/login','POST'],['/api/session','GET'],['/api/logout','POST'],['/api/drive-status','GET'],['/api/dashboard','GET']]);
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; frame-src https://www.openstreetmap.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
function secure(response) {
  const result = new Response(response.body, response);
  for (const [key,value] of Object.entries({'Cache-Control':'no-store','Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Strict-Transport-Security':'max-age=31536000'})) result.headers.set(key,value);
  return result;
}
const error = (status,message) => secure(Response.json({error:message},{status}));
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(request.method)) return error(405,'Método não permitido.');
      if (!['/','/index.html','/styles.css','/app.js','/maintenance-ui.js','/warehouse-ui.js','/users-ui.js','/warehouse.css','/assets/warehouse-chips.png','/assets/warehouse-devices.png','/assets/warehouse-rs300.png','/assets/warehouse-rs300-scene.png','/assets/warehouse-values.png','/pin-state.js','/stock-tools.js','/mark.svg','/assets/ui-artwork.png','/assets/metric-icons.png','/assets/login-map.png','/vendor/leaflet.css','/vendor/leaflet.js','/location-view.js','/assets/location-icons.png','/assets/toolbar-icons.png','/assets/maintenance-hero.png','/assets/operation-heroes.png'].includes(url.pathname)) return error(404,'Página não encontrada.');
      return secure(await env.ASSETS.fetch(request));
    }
    if(url.pathname==='/api/configurator'){
      if(request.method!=='POST')return error(405,'Método inválido.');
      const credential=JSON.parse(env.CONFIGURATOR_ACCESS||'null'),token=request.headers.get('x-central-configurator')||'';
      if(!credential?.token_hash||!/^[a-f0-9]{64}$/.test(token)||digest(token)!==credential.token_hash)return error(401,'Credencial inválida.');
      const raw=await request.text();if(raw.length>4096)return error(413,'Solicitação muito grande.');
      let input;try{input=JSON.parse(raw);}catch{return error(400,'Solicitação inválida.');}
      return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v1')).fetch(new Request('https://operations.internal/configurator',{method:'POST',body:JSON.stringify({input})})));
    }
    if(url.pathname==='/api/maintenance-import'){
      if(request.method!=='POST')return error(405,'Método inválido.');
      const raw=await request.text();if(raw.length>100000)return error(413,'Lote muito grande.');
      if(!verifyImport(raw,request.headers.get('x-import-signature'),env.AUTH_DATA_KEY,env.MAINTENANCE_IMPORT_UNTIL))return error(403,'Importação desabilitada.');
      return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v1')).fetch(new Request('https://operations.internal/maintenance-import',{method:'POST',body:JSON.stringify({kind:'maintenance-import',importBody:raw,importSignature:request.headers.get('x-import-signature')})})));
    }
    if (!routes.has(url.pathname)) return error(404,'Recurso não disponível nesta Central.');
    if (request.method !== routes.get(url.pathname)) return error(405,'Método não permitido.');
    if (url.pathname!=='/api/galaxy' && request.method === 'POST' && request.headers.get('origin') !== url.origin) return error(403,'Origem inválida.');
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
      return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v1')).fetch(new Request('https://operations.internal/galaxy',{method:'POST',body:JSON.stringify({input,token,android})})));
    }
    const headers = new Headers({'x-parallel-ip':request.headers.get('cf-connecting-ip') || 'unknown'});
    for(const key of ['content-type','x-csrf-token']) if(request.headers.has(key))headers.set(key,request.headers.get(key));
    const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>/^parallel_drive_session=[a-f0-9]{64}$/.test(x));
    if(cookie)headers.set('cookie',cookie);
    try {
      const jobs=url.pathname==='/api/jobs',wh=url.pathname==='/api/warehouse',maint=url.pathname==='/api/maintenance',inventory=url.pathname==='/api/inventory',live=url.pathname==='/api/live'||inventory||maint||wh||jobs;
      const tracking=url.pathname==='/api/tracking',access=url.pathname==='/api/access',dashboard=url.pathname==='/api/dashboard',driveStatus=url.pathname==='/api/drive-status';
      const auth=env.AUTH.get(env.AUTH.idFromName('central-paralela-auth-v1'));
      const response=await auth.fetch(new Request('https://auth.internal'+(live||tracking||access||driveStatus||dashboard?'/api/session':url.pathname),{method:live?'GET':request.method,headers,body:live?undefined:body}));
      if(live){
        if(!response.ok)return error(response.status,'Entre no sistema para continuar.');
        const user=await response.json();
        if(request.headers.get('x-csrf-token')!==user.csrf)return error(403,'Sessão de formulário inválida.');
        let input;try{input=JSON.parse(new TextDecoder().decode(body));}catch{return error(400,'Consulta inválida.');}
        if(jobs&&!user.permissions?.owner)return error(403,'Somente administrador.');
        if(!jobs&&!user.permissions?.views?.includes(wh?'warehouse':maint?'maintenance':'stock')||!user.branches?.some(b=>b.id===input?.branch))return error(403,'Sem acesso a esta filial ou módulo.');
        if(!env.OPERATIONS||(!jobs&&!inventory&&!maint&&!wh&&!env.INTEGRATIONS_CONFIG))return error(503,'Integrações ainda não configuradas.');
        return secure(await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v1')).fetch(new Request('https://operations.internal/'+(jobs?'jobs':wh?'warehouse':maint?'maintenance':inventory?'inventory':'query'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(jobs||inventory||maint||wh?{input,user}:input)})));
      }
      if(response.ok&&(tracking||dashboard||['/api/login','/api/session'].includes(url.pathname))&&env.OPERATIONS){const barrier=await env.OPERATIONS.get(env.OPERATIONS.idFromName('central-paralela-operations-v1')).fetch(new Request('https://operations.internal/barrier',{method:'POST',body:'{}'}));if(!barrier.ok)return error(503,'Recuperação de gravação pendente. Tente novamente.');}
      if(tracking){
        if(!response.ok)return error(response.status,'Entre no sistema para continuar.');
        const user=await response.json();if(!user.permissions?.views?.includes('stock'))return error(403,'Sem acesso ao estoque.');
        try{return secure(Response.json(await driveTracking(JSON.parse(env.DRIVE_CONFIG||'null'),(user.branches||[]).map(b=>b.id))));}catch{return error(503,'Cópia de aparelhos indisponível no Drive.');}
      }
      if(dashboard){
        if(!response.ok)return error(response.status,'Entre no sistema para continuar.');
        const user=await response.json(),branch=url.searchParams.get('branch');
        if(!user.permissions?.views?.includes('overview')||!user.branches?.some(b=>b.id===branch))return error(403,'Sem acesso a este painel ou filial.');
        try{return secure(Response.json(await driveDashboard(JSON.parse(env.DRIVE_CONFIG||'null'),branch)));}
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
        const tasks=[];
        if(user.branches?.length){const config=JSON.parse(env.DRIVE_CONFIG||'null'),ids=user.branches.map(b=>b.id);
          if(user.permissions?.views?.includes('overview')&&!user.permissions?.views?.includes('stock'))tasks.push(driveDashboards(config,ids).then(rows=>{user.dashboard=rows;}).catch(()=>{user.dashboardError='Cópia do painel indisponível. Recarregue para tentar novamente.';}));
          if(user.permissions?.views?.includes('stock'))tasks.push(driveTracking(config,ids).then(rows=>{user.tracking=rows;if(user.permissions?.views?.includes('overview'))user.dashboard=rows.map(trackingDashboard);}).catch(()=>{user.trackingError='Cópia dos aparelhos indisponível. Recarregue para tentar novamente.';}));
        }
        await Promise.all(tasks);
        return secure(new Response(JSON.stringify(user),{status:response.status,headers:response.headers}));
      }
      const result=new Response(response.body,response);
      return secure(result);
    } catch {return error(503,'Não foi possível conectar. Tente novamente.');}
  }
};
