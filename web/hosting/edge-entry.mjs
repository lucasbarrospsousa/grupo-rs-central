import {Buffer} from 'node:buffer';
import {api} from '../backend/api.mjs';
import {createPool} from '../backend/database.mjs';
import {timingSafeEqual} from 'node:crypto';
const pool=createPool(),handler=api(pool);
// Only the hosted site knows this separate bridge token; user sessions and CSRF
// are still validated by the ordinary API. No database administrative key is used.
export async function edgeFetch(request){
 const expected=process.env.CENTRAL_BRIDGE_TOKEN||'',actual=request.headers.get('x-central-bridge')||'';
 if(!expected||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return Response.json({error:'Acesso não autorizado.'},{status:401});
 const url=new URL(request.url),origin=process.env.CENTRAL_PUBLIC_ORIGIN;
 if(!origin||!origin.startsWith('https://'))return Response.json({error:'Origem do site não configurada.'},{status:503});
 const relative=url.pathname.replace(/^\/central-api/,'');
 if(!relative.startsWith('/api/'))return new Response('Não encontrado',{status:404});
 const headers=Object.fromEntries(request.headers);headers.host=new URL(origin).host;
 const req={method:request.method,url:relative+url.search,headers,socket:{remoteAddress:request.headers.get('x-central-client-ip')||'unknown'},async *[Symbol.asyncIterator](){if(request.body)for await(const chunk of request.body)yield Buffer.from(chunk);}};
 let status=200,output,ended=false;const responseHeaders=new Headers({'Cache-Control':'no-store'});
 const res={setHeader(k,v){responseHeaders.set(k,v);},writeHead(code,values={}){status=code;for(const [k,v] of Object.entries(values))responseHeaders.set(k,v);},end(value){output=value;ended=true;}};
 try{await handler(req,res);return new Response(output||'',{status:ended?status:404,headers:responseHeaders});}catch{return Response.json({error:'Serviço temporariamente indisponível.'},{status:503});}
}
if(import.meta.main)Deno.serve(edgeFetch);
