import {warehouseLinkTick} from '../backend/warehouse-link-monitor.mjs';
import {warehouseChipTick} from '../backend/warehouse-chip-monitor.mjs';
import {resumeLinkQueues} from '../backend/auto-link-queue.mjs';
import {smsCloudFetch} from '../backend/sms-cloud.mjs';
import {codeTick,scanBranch} from '../backend/code-scan.mjs';
import {guardedIntegrations} from '../backend/background-sync.mjs';
import {syncTick} from '../backend/background-sync.mjs';
import {maintenanceTick} from '../backend/maintenance-monitor.mjs';
import {configuratorFetch} from '../backend/configurator.mjs';
import {Buffer} from 'node:buffer';
import {api} from '../backend/api.mjs';
import {createPool} from '../backend/database.mjs';
import {timingSafeEqual} from 'node:crypto';
import {powerState,withServerPower} from '../backend/server-power.mjs';
const pool=createPool(),handler=api(pool);
// Only the hosted site knows this separate bridge token; user sessions and CSRF
// are still validated by the ordinary API. No database administrative key is used.
export async function edgeFetch(request){
 const path=new URL(request.url).pathname;
 const [key,header]=path.endsWith('/internal/sms-gateway')?['CENTRAL_SMS_GATEWAY_TOKEN','x-rs-gateway']:path.endsWith('/internal/configurator')?['CENTRAL_CONFIGURATOR_TOKEN','x-central-configurator']:['/internal/sync','/internal/maintenance','/internal/codes','/internal/warehouse'].some(p=>path.endsWith(p))?['CENTRAL_SYNC_TOKEN','x-central-sync']:['CENTRAL_BRIDGE_TOKEN','x-central-bridge'];
 const expected=Buffer.from(process.env[key]||''),actual=Buffer.from(request.headers.get(header)||'');
 if(!expected.length||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:'Acesso não autorizado.'},{status:401});
 try{
  if(path.endsWith('/internal/power-state')&&request.method==='GET')return Response.json(await powerState(pool),{headers:{'Cache-Control':'no-store'}});
  return await withServerPower(pool,pending=>handleRequest(request,pending),globalThis.EdgeRuntime?.waitUntil?.bind(globalThis.EdgeRuntime));
 }catch{return Response.json({error:'Disponibilidade da Central não confirmada.'},{status:503});}
}
async function handleRequest(request,pending){
 if(new URL(request.url).pathname.endsWith('/internal/sms-gateway'))return smsCloudFetch(request,pool);
 if(new URL(request.url).pathname.endsWith('/internal/configurator'))return configuratorFetch(request,pool);
 if(['/internal/sync','/internal/maintenance','/internal/codes','/internal/warehouse'].some(p=>new URL(request.url).pathname.endsWith(p))){
  const expected=process.env.CENTRAL_SYNC_TOKEN||'',actual=request.headers.get('x-central-sync')||'';
  if(request.method!=='POST'||!expected||actual.length!==expected.length||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return Response.json({error:'Acesso não autorizado.'},{status:401});
  try{if(new URL(request.url).pathname.endsWith('/internal/warehouse')){return Response.json({links:await warehouseLinkTick(pool),chips:await warehouseChipTick(pool)});}if(new URL(request.url).pathname.endsWith('/internal/sync')){pending.push(resumeLinkQueues(pool,guardedIntegrations(pool)).catch(()=>{}));}const branch=new URL(request.url).pathname.endsWith('/internal/codes')?scanBranch((await request.json()).branch):null;return Response.json(await (new URL(request.url).pathname.endsWith('/internal/codes')?codeTick(pool,{branch,service:guardedIntegrations(pool,undefined,{captureCodes:false,apiOnly:true})}):new URL(request.url).pathname.endsWith('/internal/maintenance')?maintenanceTick(pool):syncTick(pool)));}catch{return Response.json({error:'Atualização automática pendente.'},{status:503});}
 }
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
