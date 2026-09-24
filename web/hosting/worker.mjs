const policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export default {async fetch(request,env){
 const url=new URL(request.url);let response;
 if(url.pathname.startsWith('/api/')){
  if(!env.CENTRAL_BRIDGE_TOKEN)return Response.json({error:'Conexão segura ainda não configurada.'},{status:503});
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==url.origin)return Response.json({error:'Origem inválida.'},{status:403});
  const headers=new Headers();for(const name of ['content-type','cookie','x-csrf-token','idempotency-key','origin'])if(request.headers.has(name))headers.set(name,request.headers.get(name));
  headers.set('x-central-bridge',env.CENTRAL_BRIDGE_TOKEN);headers.set('x-central-client-ip',request.headers.get('cf-connecting-ip')||'unknown');
  try{response=await fetch('https://vwiayytzmorcjeaszowg.supabase.co/functions/v1/central-api'+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});}catch{response=Response.json({error:'Servidor indisponível. Tente novamente.'},{status:503});}
 }else if(url.pathname==='/mode.js')response=new Response('export default "homologacao";',{headers:{'Content-Type':'text/javascript'}});
 else response=await env.ASSETS.fetch(request);
 const secured=new Response(response.body,response);secured.headers.set('Content-Security-Policy',policy);secured.headers.set('X-Content-Type-Options','nosniff');secured.headers.set('Referrer-Policy','strict-origin-when-cross-origin');secured.headers.set('Cache-Control','no-store');return secured;
}};
