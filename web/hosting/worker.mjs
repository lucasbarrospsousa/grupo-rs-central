const policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export default {async fetch(request,env){
 const url=new URL(request.url);let response;
 if(url.pathname==='/'||url.pathname==='/index.html'){
  try{
   const r=await fetch('https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api/internal/power-state',{headers:{'x-central-bridge':env.CENTRAL_BRIDGE_TOKEN||'','x-region':env.CENTRAL_DB_REGION||'us-west-2'},signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw Error('Unavailable');const p=await r.json();
   if(p.state!=='on')return new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Central indisponível</title><body style="background:#102e46;color:white;font:18px system-ui;text-align:center;padding:15vh 20px"><h1>Central desligada pelo administrador</h1><p>Dados e progresso preservados. Aguarde a liberação pelo portal.</p><a href="/" style="color:#70caff">Verificar novamente</a></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Disponibilidade da Central não confirmada.'},{status:503,headers:{'Cache-Control':'no-store'}});}
 }
 if(url.pathname.startsWith('/api/')){
  if(!env.CENTRAL_BRIDGE_TOKEN)return Response.json({error:'Conexão segura ainda não configurada.'},{status:503});
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==url.origin)return Response.json({error:'Origem inválida.'},{status:403});
  const headers=new Headers();for(const name of ['content-type','cookie','x-csrf-token','idempotency-key','origin'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
  headers.set('x-region',env.CENTRAL_DB_REGION||'us-west-2');headers.set('x-central-bridge',env.CENTRAL_BRIDGE_TOKEN);headers.set('x-central-client-ip',request.headers.get('cf-connecting-ip')||'unknown');
  try{response=await fetch('https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api'+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});}catch{response=Response.json({error:'Servidor indisponível. Tente novamente.'},{status:503});}
 }else if(url.pathname==='/mode.js')response=new Response('export default "production";',{headers:{'Content-Type':'text/javascript'}});
 else response=await env.ASSETS.fetch(request);
 const secured=new Response(response.body,response);secured.headers.set('Content-Security-Policy',policy);secured.headers.set('X-Content-Type-Options','nosniff');secured.headers.set('Referrer-Policy','strict-origin-when-cross-origin');secured.headers.set('Cache-Control','no-store');return secured;
}};
