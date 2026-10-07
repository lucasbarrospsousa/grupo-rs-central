import {timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {SMS_BASES} from './sms-template.mjs';
import {scoped} from './remote-actions.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const transitions={pending:['received','expired','failed','indeterminate'],received:['sending','sent','delivered','failed','cancelled','expired','indeterminate'],sending:['sent','delivered','failed','indeterminate'],indeterminate:['sent','delivered','failed'],sent:['delivered'],delivered:[],failed:[],expired:[],cancelled:[]};
export const validSmsTransition=(from,to)=>from===to||!!transitions[from]?.includes(to);
export async function smsCloudOperation(c,p,device,branches=['imperatriz']){
 branches=branches.filter(b=>SMS_BASES.includes(b));if(!branches.length)throw fail(403,'Gateway sem bases autorizadas.');
 if(!['poll','report'].includes(p.action))throw fail(400,'Ação inválida.');
 if(p.action==='report'){
  if(!uuid.test(p.id||'')||!Object.hasOwn(transitions,p.state)||p.state==='pending')throw fail(400,'Retorno inválido.');
  const op=(await c.query("select state,result from central_homologacao.remote_operations where id=$1 and branch_id=any($2::text[]) and kind='sms' for update",[p.id,branches])).rows[0];
  if(!op||op.result?.cloud_device!==device)throw fail(404,'Pedido não pertence a este gateway.');
  if(!validSmsTransition(op.state,p.state))return{ok:true,ignored:true,state:op.state};
  await c.query('update central_homologacao.remote_operations set state=$2,result=result||$3::jsonb,updated_at=now() where id=$1',[p.id,p.state,JSON.stringify({remote_at:Number.isSafeInteger(p.updated_at)?p.updated_at:null,detail:String(p.detail||'').slice(0,180)})]);
  return{ok:true,state:p.state};
 }
 if(typeof p.ready!=='boolean')throw fail(400,'Estado do gateway inválido.');
 await c.query("select set_config('central.sms_cloud','on',true)");
 await c.query("select pg_advisory_xact_lock(hashtext('central-sms-cloud'))");
 await c.query("insert into central_homologacao.sms_bridge_status(branch_id,healthy,details) select unnest($2::text[]),true,$1::jsonb on conflict(branch_id) do update set healthy=true,checked_at=now(),details=excluded.details",[{mode:'cloud',device,send_enabled:p.ready,app_version:String(p.app_version||'').slice(0,20)},branches]);
 await c.query("update central_homologacao.remote_operations set state='expired',updated_at=now() where branch_id=any($1::text[]) and kind='sms' and state='queued' and not(result ? 'bridge_attempted_at') and (payload->>'expires_at')::bigint<=extract(epoch from now())",[branches]);
 // Diagnostic mode never claims queued operations. A durable fence excludes the PC bridge.
 if(p.ready)await c.query("with picked as (select id from central_homologacao.remote_operations where branch_id=any($2::text[]) and kind='sms' and state='queued' and not(result ? 'bridge_attempted_at') order by created_at limit 10 for update skip locked) update central_homologacao.remote_operations o set state='pending',result=o.result||jsonb_build_object('bridge_attempted_at',now(),'cloud_device',$1::text),updated_at=now() from picked where o.id=picked.id",[device,branches]);
 const rows=(await c.query("select id,state,payload from central_homologacao.remote_operations where branch_id=any($2::text[]) and kind='sms' and result->>'cloud_device'=$1 and (state in ('pending','received','sending','indeterminate') or state='sent' and created_at>now()-interval '24 hours') order by updated_at limit 30",[device,branches])).rows;
 return{ok:true,interval_seconds:15,jobs:rows.map(r=>({id:r.id,state:r.state,...(p.ready&&r.state==='pending'?{payload:r.payload}:{})}))};
}
export async function smsCloudFetch(request,pool){
 const expected=Buffer.from(process.env.CENTRAL_SMS_GATEWAY_TOKEN||''),actual=Buffer.from(request.headers.get('x-rs-gateway')||'');
 if(request.method!=='POST'||expected.length<32||actual.length!==expected.length||!timingSafeEqual(expected,actual))return Response.json({ok:false,error:'Gateway não autorizado.'},{status:401});
 const user_id=process.env.CENTRAL_SMS_GATEWAY_USER,device=process.env.CENTRAL_SMS_GATEWAY_DEVICE;
 if(!user_id||!uuid.test(device||''))return Response.json({ok:false,error:'Configuração pendente.'},{status:503});
 try{
  let raw='';if(request.body)for await(const bytes of request.body){raw+=Buffer.from(bytes).toString('utf8');if(raw.length>4096)throw fail(413,'Pedido excedeu o limite.');}
  const p=JSON.parse(raw);return Response.json(await scoped(pool,{user_id},async c=>{
   const memberships=(await c.query("select branch_id from central_homologacao.memberships where user_id=$1 and role='admin' and branch_id=any($2::text[])",[user_id,SMS_BASES])).rows;
   // Older clients must never claim requests they cannot interpret.
   const branches=memberships.map(r=>r.branch_id).filter(b=>p.multibase===true||b==='imperatriz');
   return smsCloudOperation(c,p,device,branches);
  }));
 }catch(e){return Response.json({ok:false,error:e.status?e.message:'Conexão temporariamente indisponível.'},{status:e.status||503});}
}
