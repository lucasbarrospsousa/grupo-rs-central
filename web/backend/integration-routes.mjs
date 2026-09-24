import {bridgeHealth} from './sms-queue.mjs';
import {prepareStandardSms} from './sms-template.mjs';
import {remoteAction,scoped} from './remote-actions.mjs';
import {createHash} from 'node:crypto';
import {integrations} from './integrations.mjs';
import {guardedIntegrations} from './background-sync.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const send=(res,data)=>{res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const active=new Map();
export async function integrationRoute({req,res,url,pool,user,readBody,service=integrations}){
 if(!url.pathname.startsWith('/api/integrations/'))return false;
 const branch=url.searchParams.get('branch');const membership=(await pool.query('select role from central_homologacao.memberships where user_id=$1 and branch_id=$2',[user.user_id,branch])).rows[0];if(!membership)throw fail(403,'Sem acesso a esta filial.');
 const count=active.get(user.user_id)||0;if(count>=3)throw fail(429,'Aguarde as consultas em andamento.');active.set(user.user_id,count+1);
 try{
  const action=url.pathname.split('/').at(-1),serial=url.searchParams.get('serial');
  if(req.method==='GET'){
   let data;
   if(action==='sync-status')data=(await pool.query('select central_homologacao.sync_status() as status')).rows[0].status;
   else if(action==='gateway')data=await scoped(pool,user,c=>bridgeHealth(c,branch));
   else if(action==='stock')data=await (service===integrations?guardedIntegrations(pool):service).stockDetails(branch,serial);
   else if(action==='equipment')data=await service.equipmentPortal(branch,serial);
   else if(action==='sms-template')data=await prepareStandardSms(service,branch,serial);
   else if(action==='operations')data={rows:await scoped(pool,user,async c=>(await c.query('select id,kind,serial,state,result,created_at,updated_at,payload from central_homologacao.remote_operations where branch_id=$1 order by created_at desc limit 100',[branch])).rows)};
   else if(action==='maintenance'){const snapshot=(await pool.query('select central_homologacao.sync_panorama($1) as snapshot',[branch])).rows[0].snapshot;if(!snapshot)throw fail(503,'Aguardando a primeira consulta automática desta base.');if(snapshot.data.ok===false)throw fail(503,snapshot.data.message);data={...snapshot.data,checked_at:snapshot.checked_at};}
   else if(action==='binding')data=await service.binding(branch,serial);
   else if(action==='location')data=await service.location(branch,serial);
   else if(action==='history')data=await service.history(branch,serial,url.searchParams.get('start'),url.searchParams.get('end'));
   else if(action==='client-vehicles')data={rows:await service.clientVehicles(branch,url.searchParams.get('client'))};
   else if(action==='clients')data={rows:await service.clients(branch,url.searchParams.get('q'))};
   else if(action==='carrier')data=await service.carrier(url.searchParams.get('provider'),url.searchParams.get('iccid'));
   else if(action==='status'){await service.api(branch,'/endpoints/veiculos.php?skip=0&take=1');await service.maintenance(branch);data={api:true,portal:true,branch,checked_at:new Date().toISOString()};}
   else throw fail(404,'Consulta não reconhecida.');send(res,data);return true;
  }
  if(['link','sms','reconcile'].includes(action)&&req.method==='POST'){send(res,await remoteAction({action,body:await readBody(req),branch,user,role:membership.role,pool,service}));return true;}
  if(action!=='discharge'||req.method!=='POST')throw fail(405,'Operação indisponível.');
  if(membership.role==='reader')throw fail(403,'Usuário somente de leitura.');
  const body=await readBody(req),key=req.headers['idempotency-key'];if(!/^[a-f0-9-]{36}$/.test(key||'')||typeof body.id!=='string'||!Number.isInteger(body.version))throw fail(400,'Identificador ou versão inválidos.');
  const fingerprint=createHash('sha256').update(JSON.stringify([branch,body])).digest('hex');
  const previous=(await pool.query('select fingerprint,response from central_homologacao.requests where user_id=$1 and request_key=$2',[user.user_id,key])).rows[0];if(previous){if(previous.fingerprint!==fingerprint)throw fail(409,'Identificador reutilizado.');send(res,previous.response);return true;}
  const c=await pool.connect();let current;try{await c.query('BEGIN');await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);current=(await c.query('select * from central_homologacao.devices where id=$1 and branch_id=$2 and deleted_at is null',[body.id,branch])).rows[0];await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  if(!current||current.version!==body.version||!(['Estoque',...(branch==='imperatriz'?[]:['Reserva'])].includes(current.data.status)))throw fail(409,'Cadastro mudou ou não está em estoque.');
  const remote=await service.binding(branch,current.serial);if(!remote.ok||remote.plate!==body.plate||remote.client!==body.client)throw fail(409,'Vínculo mudou ou não foi confirmado. Analise novamente.');
  const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("select set_config('central.user_id',$1,true)",[user.user_id]);await tx.query('select pg_advisory_xact_lock(hashtext($1))',[user.user_id+key]);const replay=(await tx.query('select response,fingerprint from central_homologacao.requests where user_id=$1 and request_key=$2',[user.user_id,key])).rows[0];if(replay){if(replay.fingerprint!==fingerprint)throw fail(409,'Identificador reutilizado.');await tx.query('COMMIT');send(res,replay.response);return true;}
   const r=await tx.query("update central_homologacao.devices set data=data||$4::jsonb,version=version+1,updated_at=now() where id=$1 and branch_id=$2 and version=$3 and deleted_at is null returning id",[body.id,branch,body.version,JSON.stringify({status:'Instalado',plate:remote.plate,client:remote.client,installed_at:new Date().toISOString()})]);if(!r.rowCount)throw fail(409,'Cadastro mudou durante a consulta.');
   const result={ok:true,id:body.id,version:body.version+1};await tx.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'DISCHARGE',body.id,{beforeVersion:body.version,source:remote.source}]);await tx.query('insert into central_homologacao.requests values($1,$2,$3,$4,now())',[user.user_id,key,fingerprint,result]);await tx.query('COMMIT');send(res,result);return true;
  }catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}
 }finally{active.set(user.user_id,(active.get(user.user_id)||1)-1);}
}
