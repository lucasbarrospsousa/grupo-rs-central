import {randomUUID} from 'node:crypto';
import {scoped} from './remote-actions.mjs';
import {startAutoLink,runAutoLink} from './auto-link.mjs';

const fail=(status,message)=>Object.assign(Error(message),{status});
export async function cancelLinkQueue({pool,user,branch}){
 return scoped(pool,user,async c=>{
  await c.query("select pg_advisory_xact_lock(hashtext($1))",['central-auto-link:'+branch]);
  const rows=(await c.query("select id,payload,state from central_homologacao.remote_operations where branch_id=$1 and kind='link' and payload->>'automatic'='true' and state in ('submitted','prepared','pending') order by id for update",[branch])).rows;
  let cancelled=0,inFlight=0,uncertain=0;
  for(const op of rows){
   if(op.state==='pending'){uncertain++;continue;}
   if(op.payload.sent){inFlight++;await c.query("update central_homologacao.remote_operations set payload=payload||'{\"cancel_requested\":true}'::jsonb where id=$1",[op.id]);continue;}
   await c.query("update central_homologacao.remote_operations set state='cancelled',result=$2,updated_at=now() where id=$1",[op.id,{message:'Vinculação cancelada antes do envio.'}]);
   await c.query("update central_homologacao.link_targets set state='available',operation_id=null where operation_id=$1 and state='reserved'",[op.id]);cancelled++;
  }
  await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'CANCEL_LINK_QUEUE',randomUUID(),{cancelled,inFlight,uncertain}]);
  return {ok:true,cancelled,inFlight,uncertain,message:`${cancelled} canceladas · ${inFlight} já enviadas aguardando resultado · ${uncertain} pendentes de conferência.`};
 });
}
export async function startLinkBatch({body,...context}){
 if(!Array.isArray(body.items)||!body.items.length||body.items.length>50)throw fail(400,'Selecione de 1 a 50 aparelhos por lote.');
 if(body.items.some(r=>!r||typeof r.id!=='string'||!Number.isInteger(r.version)))throw fail(400,'Seleção inválida. Atualize a lista.');
 const items=[...new Map(body.items.map(r=>[r.id,r])).values()],results=[];
 for(const item of items){
  try{results.push({device_id:item.id,ok:true,...await startAutoLink({...context,body:item})});}
  catch(e){results.push({device_id:item.id,ok:false,message:e.status?e.message:'Não foi possível incluir este aparelho. Atualize o progresso antes de tentar novamente.'});}
 }
 const added=results.filter(r=>r.ok&&!r.existing).length,existing=results.filter(r=>r.ok&&r.existing).length;
 return {ok:true,results,message:`${added} novos na fila · ${existing} já registrados · ${results.filter(r=>!r.ok).length} não incluídos. Até 2 vinculações simultâneas nesta base.`};
}

// Database transaction serializes claims across users, tabs and server instances.
export async function claimLink({pool,user,branch}){
 return scoped(pool,user,async c=>{
  await c.query("select pg_advisory_xact_lock(hashtext($1))",['central-auto-link:'+branch]);
  await c.query(`update central_homologacao.remote_operations set state='pending',result=$2,updated_at=now()
   where branch_id=$1 and kind='link' and state='submitted' and payload->>'automatic'='true'
   and (payload ? 'running_at' or payload->>'sent'='true') and updated_at<now()-interval '15 minutes'`,[branch,{message:'Execução interrompida. Confira o vínculo; nenhum reenvio automático.'}]);
  const active=(await c.query(`select count(*)::int n from central_homologacao.remote_operations
   where branch_id=$1 and kind='link' and state='submitted' and payload->>'automatic'='true'
   and (payload ? 'running_at' or payload->>'sent'='true')`,[branch])).rows[0].n;
  if(active>=2)return null;
  const op=(await c.query(`select o.id,o.user_id from central_homologacao.remote_operations o
   join central_homologacao.users u on u.id=o.user_id and u.active
   join central_homologacao.memberships m on m.user_id=u.id and m.branch_id=o.branch_id and m.role in ('admin','operator')
   left join central_homologacao.user_permissions p on p.user_id=u.id
   where o.branch_id=$1 and o.kind='link' and o.state='submitted' and o.payload->>'automatic'='true'
   and not(o.payload ? 'running_at') and coalesce(o.payload->>'sent','false')!='true'
   and (o.payload->>'retry_at' is null or (o.payload->>'retry_at')::timestamptz<=now())
   and ((u.username='lucasabm' and m.role='admin') or 'stock'=any(p.writes))
   order by o.created_at,o.id for update of o skip locked limit 1`,[branch])).rows[0];
  if(!op)return null;
  const claim=randomUUID();
  await c.query("update central_homologacao.remote_operations set payload=payload||jsonb_build_object('running_at',now(),'claim',$2::text),updated_at=now() where id=$1",[op.id,claim]);
  return {...op,claim};
 });
}

export async function drainLinkQueue({pool,user,branch,service,budgetMs=45000,now=Date.now}){
 const until=now()+budgetMs;
 const lane=async()=>{while(now()<until){
  const op=await claimLink({pool,user,branch});if(!op)return;
  const actor={user_id:op.user_id};
  try{await runAutoLink(op.id,{pool,user:actor,service,claim:op.claim});}
  catch{await scoped(pool,actor,c=>c.query("update central_homologacao.remote_operations set state='pending',result=$3,updated_at=now() where id=$1 and payload->>'claim'=$2 and state='submitted'",[op.id,op.claim,{message:'Execução interrompida. Confira o vínculo; nenhum reenvio automático.'}]));}
 }};
 await Promise.all([lane(),lane()]);
}

// Existing authenticated server tick resumes only previously authorized, unsent work.
export async function resumeLinkQueues(pool,service){
 const branches=(await pool.query(`select distinct on(m.branch_id) m.branch_id,u.id as user_id
  from central_homologacao.memberships m join central_homologacao.users u on u.id=m.user_id and u.active
  left join central_homologacao.user_permissions p on p.user_id=u.id
  where m.role in ('admin','operator') and ((u.username='lucasabm' and m.role='admin') or 'stock'=any(p.writes))
  order by m.branch_id,u.id`)).rows;
 await Promise.all(branches.map(r=>drainLinkQueue({pool,user:{user_id:r.user_id},branch:r.branch_id,service})));
}
