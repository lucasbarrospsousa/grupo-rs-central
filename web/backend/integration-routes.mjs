import {equipmentSwap} from './equipment-swap.mjs';
import {startLinkBatch,drainLinkQueue,cancelLinkQueue} from './auto-link-queue.mjs';
import {startAutoLink} from './auto-link.mjs';
import {lookupEquipment,inventoryCounts} from './inventory-tools.mjs';
import {stockBatch} from './stock-batch.mjs';
import {maintenanceSnapshot} from './maintenance-monitor.mjs';
import {integrationHealth,testBranchConnections} from './integration-health.mjs';
import {bridgeHealth} from './sms-queue.mjs';
import {prepareStandardSms} from './sms-template.mjs';
import {remoteAction,scoped} from './remote-actions.mjs';
import {createHash} from 'node:crypto';
import {integrations} from './integrations.mjs';
import {guardedIntegrations} from './background-sync.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const send=(res,data)=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const active=new Map(),services=new WeakMap();
export async function integrationRoute({req,res,url,pool,user,permissions,readBody,service=integrations}){
 if(!url.pathname.startsWith('/api/integrations/'))return false;
 const branch=url.searchParams.get('branch');const membership=(await pool.query('select role from central_homologacao.memberships where user_id=$1 and branch_id=$2',[user.user_id,branch])).rows[0];if(!membership)throw fail(403,'Sem acesso a esta filial.');
 const count=active.get(user.user_id)||0;if(count>=3)throw fail(429,'Aguarde as consultas em andamento.');active.set(user.user_id,count+1);
 try{
  if(service===integrations){if(!services.has(pool))services.set(pool,guardedIntegrations(pool));service=services.get(pool);}
  const action=url.pathname.split('/').at(-1),serial=url.searchParams.get('serial');
  if(action==='equipment-swap'){
   if(membership.role==='reader'||(!permissions?.owner&&!permissions?.writes?.includes('stock')))throw fail(403,'Sem permissão para trocar aparelhos.');
   if(req.method==='GET'){send(res,await equipmentSwap({pool,user,branch,service,action:'status',body:{serial}}));return true;}
   if(req.method!=='POST')throw fail(405,'Método inválido.');
   const b=await readBody(req);if(!['preview','execute'].includes(b.action))throw fail(400,'Ação inválida.');
   send(res,await equipmentSwap({pool,user,branch,service,action:b.action,body:b}));return true;
  }
  if(action==='link-lots')throw fail(410,'A numeração da vinculação agora é automática.');
  if(action==='auto-link'){
   if(membership.role==='reader'||(!permissions?.owner&&!permissions?.writes?.includes('stock')))throw fail(403,'Sem permissão para vincular no estoque.');
   if(req.method==='GET'){
    const data=await scoped(pool,user,async c=>({rows:(await c.query("select id,serial,state,result,updated_at,payload ? 'running_at' or payload->>'sent'='true' as running from central_homologacao.remote_operations where branch_id=$1 and kind='link' and payload->>'automatic'='true' order by created_at desc limit 200",[branch])).rows}));send(res,data);return true;
   }
   if(req.method!=='POST')throw fail(405,'Método inválido.');
   const body=await readBody(req);
   if(body.cancel===true){send(res,await cancelLinkQueue({pool,user,branch}));return true;}
   const result=body.items?await startLinkBatch({pool,user,branch,body,service}):await startAutoLink({pool,user,branch,body,service});
   {const task=drainLinkQueue({pool,user,branch,service}).catch(()=>{});if(globalThis.EdgeRuntime?.waitUntil)globalThis.EdgeRuntime.waitUntil(task);else void task;}
   send(res,{ok:true,...result,message:result.message||'Vinculação na fila. Acompanhe pela lista.'});return true;
  }
  if(action==='stock-page'&&req.method==='GET'){send(res,await stockBatch({pool,user,branch,service,ids:(url.searchParams.get('ids')||'').split(','),kind:['locations','chips','identity'].includes(url.searchParams.get('kind'))?url.searchParams.get('kind'):null}));return true;}
  if(action==='equipment-refresh'&&req.method==='POST'){
   if(membership.role==='reader'||(!permissions?.owner&&!permissions?.writes?.includes('stock')))throw fail(403,'Sem permissão para atualizar aparelhos.');
   const body=await readBody(req);send(res,await stockBatch({pool,user,branch,service,ids:body.ids,kind:'equipment'}));return true;
  }
  if(req.method==='GET'){
   let data;
   const plateHint=async()=>scoped(pool,user,async c=>{
    const r=await c.query("select data->>'plate' as plate from central_homologacao.devices where branch_id=$1 and serial=$2 and deleted_at is null limit 2",[branch,serial]);
    return r.rows.length===1?r.rows[0].plate||'':'';
   });
   if(action==='inventory-counts')data=await scoped(pool,user,c=>inventoryCounts(c,branch,permissions));
   else if(action==='equipment-lookup')data=await scoped(pool,user,c=>lookupEquipment(c,service,branch,url.searchParams.get('q')));
   else if(action==='health')data=await integrationHealth(pool,user,branch);
   else if(action==='connection-test')data=await testBranchConnections(service===integrations?guardedIntegrations(pool):service,branch);
   else if(action==='sync-status')data=(await pool.query('select central_homologacao.sync_status() as status')).rows[0].status;
   else if(action==='gateway')data=await scoped(pool,user,c=>bridgeHealth(c,branch));
   else if(action==='stock'){data=await (service===integrations?guardedIntegrations(pool):service).stockDetails(branch,serial,await plateHint());if(membership.role!=='reader'&&data.equipment?.serial===serial)data.contacts=await scoped(pool,user,async c=>(await c.query('select central_homologacao.save_device_contacts($1,$2,$3) as result',[branch,serial,data.equipment])).rows[0].result);}
   else if(action==='link-preview'){const preview=await service.prepareLink(branch,serial,url.searchParams.get('plate'));data={ok:true,plate:preview.plate,serial:preview.serial,confirmed:preview.confirmed,create_required:preview.create_required===true};}
   else if(action==='equipment')data=await service.equipmentPortal(branch,serial);
   else if(action==='sms-template')data=await scoped(pool,user,c=>prepareStandardSms(c,branch,serial));
   else if(action==='operations'){const kinds=['link','sms'].filter(k=>permissions?.owner||permissions?.views?.includes(k));data={rows:await scoped(pool,user,async c=>(await c.query('select id,kind,serial,state,result,created_at,updated_at,payload from central_homologacao.remote_operations where branch_id=$1 and kind=any($2::text[]) order by created_at desc limit 100',[branch,kinds])).rows)};}
   else if(action==='maintenance')data=await maintenanceSnapshot(pool,service,branch,url.searchParams.get('refresh')==='1');
   else if(action==='binding'){data=await (service.dischargeBinding||service.binding).call(service,branch,serial);}
   else if(action==='location')data=await service.location(branch,serial,await plateHint());
   else if(action==='history')data=await service.history(branch,serial,url.searchParams.get('start'),url.searchParams.get('end'));
   else if(action==='client-vehicles')data={rows:await service.clientVehicles(branch,url.searchParams.get('client'),url.searchParams.get('name'))};
   else if(action==='clients')data={rows:await service.clients(branch,url.searchParams.get('q'),url.searchParams.get('mode')||'vehicle')};
   else if(action==='carrier')data=await service.carrier(url.searchParams.get('provider'),url.searchParams.get('iccid'));
   else if(action==='status'){await service.api(branch,'/veiculos?skip=0&take=1');data={api:true,portal:false,branch,checked_at:new Date().toISOString()};}
   else throw fail(404,'Consulta não reconhecida.');
   if(action==='stock'){const fresh=await scoped(pool,user,async c=>(await c.query('select id,serial,branch_id,data,version from central_homologacao.devices where branch_id=$1 and serial=$2 and deleted_at is null',[branch,serial])).rows[0]);if(fresh)data.contacts={...(data.contacts||{}),device:{...fresh.data,id:fresh.id,serial:fresh.serial,branch:fresh.branch_id,version:fresh.version}};}
   send(res,data);return true;
  }
  if(['link','sms','reconcile'].includes(action)&&req.method==='POST'){const body=await readBody(req);if(action==='reconcile'){const op=await scoped(pool,user,async c=>(await c.query('select kind from central_homologacao.remote_operations where id=$1 and branch_id=$2',[body.id,branch])).rows[0]);if(!op)throw fail(404,'Pedido não encontrado.');if(!permissions?.owner&&!permissions?.writes?.includes(op.kind))throw fail(403,'Sem permissão para conferir este tipo de operação.');}send(res,await remoteAction({action,body,branch,user,role:membership.role,pool,service}));return true;}
  if(action!=='discharge'||req.method!=='POST')throw fail(405,'Operação indisponível.');
  if(membership.role==='reader')throw fail(403,'Usuário somente de leitura.');
  const body=await readBody(req),key=req.headers['idempotency-key'];if(!/^[a-f0-9-]{36}$/.test(key||'')||typeof body.id!=='string'||!Number.isInteger(body.version))throw fail(400,'Identificador ou versão inválidos.');
  const fingerprint=createHash('sha256').update(JSON.stringify([branch,body])).digest('hex');
  const previous=(await pool.query('select fingerprint,response from central_homologacao.requests where user_id=$1 and request_key=$2',[user.user_id,key])).rows[0];if(previous){if(previous.fingerprint!==fingerprint)throw fail(409,'Identificador reutilizado.');send(res,previous.response);return true;}
  const c=await pool.connect();let current;try{await c.query('BEGIN');await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);current=(await c.query('select * from central_homologacao.devices where id=$1 and branch_id=$2 and deleted_at is null',[body.id,branch])).rows[0];await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  if(!current||current.version!==body.version||!(['Estoque',...(branch==='imperatriz'?[]:['Reserva'])].includes(current.data.status)))throw fail(409,'Cadastro mudou ou não está em estoque.');
  const remote=await (service.dischargeBinding||service.binding).call(service,branch,current.serial,current.data.client,{fresh:true});const manual=body.manual===true&&['stock','review'].includes(body.confirmedCategory)&&remote.category===body.confirmedCategory;if((!remote.ok&&!manual)||(remote.plate||'')!==(body.plate||'')||(remote.client||'')!==(body.client||''))throw fail(409,'Vínculo mudou ou não foi confirmado. Analise novamente.');
  const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("select set_config('central.user_id',$1,true)",[user.user_id]);await tx.query('select pg_advisory_xact_lock(hashtext($1))',[user.user_id+key]);const replay=(await tx.query('select response,fingerprint from central_homologacao.requests where user_id=$1 and request_key=$2',[user.user_id,key])).rows[0];if(replay){if(replay.fingerprint!==fingerprint)throw fail(409,'Identificador reutilizado.');await tx.query('COMMIT');send(res,replay.response);return true;}
   const r=await tx.query("update central_homologacao.devices set data=data||$4::jsonb,version=version+1,updated_at=now() where id=$1 and branch_id=$2 and version=$3 and deleted_at is null returning id",[body.id,branch,body.version,JSON.stringify({status:'Instalado',plate:remote.plate||current.data.plate||'',client:remote.client||current.data.client||'',installed_at:new Date().toISOString()})]);if(!r.rowCount)throw fail(409,'Cadastro mudou durante a consulta.');
   const result={ok:true,id:body.id,version:body.version+1};await tx.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'DISCHARGE',body.id,{beforeVersion:body.version,source:remote.source,manual,category:remote.category,confirmedPlate:body.plate,confirmedClient:body.client}]);await tx.query('insert into central_homologacao.requests values($1,$2,$3,$4,now())',[user.user_id,key,fingerprint,result]);await tx.query('COMMIT');send(res,result);return true;
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 }finally{active.set(user.user_id,(active.get(user.user_id)||1)-1);}
}
