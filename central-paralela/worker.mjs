const upstream = 'https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api';
const canonical = 'https://grupo-rs-central.lucasbarrosp.chatgpt.site';
const routes = new Map([['/api/login','POST'],['/api/session','GET'],['/api/logout','POST']]);
const policy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
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
      if (!['/','/index.html','/styles.css','/app.js','/mark.svg'].includes(url.pathname)) return error(404,'Página não encontrada.');
      return secure(await env.ASSETS.fetch(request));
    }
    if (!routes.has(url.pathname)) return error(404,'Recurso não disponível nesta Central.');
    if (request.method !== routes.get(url.pathname)) return error(405,'Método não permitido.');
    if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return error(403,'Origem inválida.');
    if (!env.CENTRAL_BRIDGE_TOKEN) return error(503,'Conexão segura indisponível.');
    let body;
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return error(415,'Formato inválido.');
      const reader=request.body?.getReader();const chunks=[];let length=0;
      if(reader) { while(true) { const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();return error(413,'Solicitação muito grande.');}chunks.push(value); } }
      body=new Uint8Array(length);let offset=0;for(const part of chunks){body.set(part,offset);offset+=part.length;}
    }
    const headers = new Headers({'x-central-bridge':env.CENTRAL_BRIDGE_TOKEN,'x-region':'us-west-2','x-central-client-ip':request.headers.get('cf-connecting-ip') || 'unknown','origin':canonical});
    for(const key of ['content-type','x-csrf-token']) if(request.headers.has(key))headers.set(key,request.headers.get(key));
    // Independent host-only cookie; the backend still validates the original session.
    const cookie=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>/^parallel_session=[a-f0-9]{64}$/.test(x));
    if(cookie)headers.set('cookie',cookie.replace('parallel_session=','central_session='));
    try {
      const response=await fetch(upstream+url.pathname,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(25000)});
      const result=new Response(response.body,response);
      const setCookie=result.headers.get('set-cookie');
      if(setCookie)result.headers.set('set-cookie',setCookie.replace('central_session=','parallel_session=')+(setCookie.includes('Secure')?'':'; Secure'));
      return secure(result);
    } catch {return error(503,'Não foi possível conectar. Tente novamente.');}
  }
};
