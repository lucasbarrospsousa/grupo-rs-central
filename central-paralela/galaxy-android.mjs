import {digest} from './auth-crypto.mjs';

const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const branchIds=new Set(['imperatriz','araguaina','acailandia','maraba']);
const terminal=new Set(['delivered','failed','expired','cancelled']);
const transitions={
 dispatched:new Set(['received','sending','sent','delivered','failed','expired','indeterminate']),
 received:new Set(['sending','sent','delivered','failed','expired','indeterminate']),
 sending:new Set(['sent','delivered','failed','indeterminate']),
 sent:new Set(['delivered']),
 indeterminate:new Set(['received','sending','sent','delivered','failed']),
 delivered:new Set(),failed:new Set(['sent','delivered']),expired:new Set(['sent','delivered']),cancelled:new Set()
};
const reportStates=new Set(['received','sending','sent','delivered','failed','expired','indeterminate']);
const validSmsCommand=(value,manual)=>typeof value==='string'&&value.trim().length>0&&Array.from(value).length<=160&&(manual?/^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]+$/u.test(value):/^[\x20-\x7e]{1,160}$/.test(value));
const canRetryPayload=(input)=>{
 const parts=String(input.app_version||'0.0.0').split('.').map(Number);
 return parts.length===3&&parts.every(Number.isInteger)&&(parts[0]>1||parts[0]===1&&(parts[1]>5||parts[1]===5&&parts[2]>=11))&&/^[a-f0-9]{64}$/.test(input.device_id||'');
};
const usersFor=async(users)=>{
 const value=await users();
 return Array.isArray(value?.users)?value.users:[];
};
const authorized=(list,job,branch)=>list.some(u=>u.active&&u.username===job.actor&&u.branches?.some(b=>b.id===branch)&&(u.permissions?.owner||u.permissions?.writes?.includes('sms')));

function applyReport(data,input,job,userList,now){
 const id=String(input?.id||'');
 const state=String(input?.state||'');
 const branch=job?.__branch||input?.branch||'';
 if(!id||!reportStates.has(state))return {id,branch,report_state:state,accepted:false,finalized:true,state:job?.state||'',error:'Recibo inválido.'};
 if(!job)return {id,branch:input?.branch||'',report_state:state,accepted:false,finalized:true,state:'',error:'Pedido não encontrado.'};
 if(input.global&&(!input.branch||input.branch!==branch))return {id,branch,report_state:state,accepted:false,finalized:true,state:job.state,conflict:true,error:'Filial do recibo incompatível.'};
 if(input.global&&job.dispatch_device_id&&input.device_id!==job.dispatch_device_id)return {id,branch,report_state:state,accepted:false,finalized:true,state:job.state,conflict:true,error:'Recibo de outro dispositivo.'};
 const current=job.state;
 if(current===state)return {id,branch,report_state:state,accepted:true,state:current,applied:false,duplicate:true};

 // A late lower-state report is acknowledged without rolling back newer evidence.
 const predecessors={
  dispatched:new Set(['queued']),received:new Set(['queued','dispatched']),
  sending:new Set(['queued','dispatched','received','indeterminate']),
  sent:new Set(['queued','dispatched','received','sending','expired','failed','indeterminate']),
  delivered:new Set(['queued','dispatched','received','sending','sent','expired','failed','indeterminate'])
 };
 if(terminal.has(current)&&current!=='delivered'&&!(['failed','expired'].includes(current)&&['sent','delivered'].includes(state)))return {id,branch,report_state:state,accepted:true,state:current,applied:false,stale:true};
 if(predecessors[current]?.has(state))return {id,branch,report_state:state,accepted:true,state:current,applied:false,stale:true};
 if(!transitions[current]?.has(state))return {id,branch,report_state:state,accepted:false,finalized:true,state:current,conflict:true,error:'Transição incompatível.'};

 // Readiness gates new dispatch. A receipt for a payload already dispatched remains valid
 // after a heartbeat or a temporary loss of SIM readiness.
 if(state==='received'&&!authorized(userList,job,job.__branch||input.branch)){
  job.state='cancelled';job.message='Envio não autorizado.';job.updated_at=now;
  return {id,branch,report_state:state,accepted:false,finalized:true,state:job.state,applied:true,error:'Autorização revogada antes do envio.'};
 }
 job.state=state;
 job.message='Retorno do Galaxy: '+state;
 job.updated_at=now;
 if(state==='received')job.received_at=now;
 if(['failed','expired','indeterminate'].includes(state)&&job.batch_id){
  for(const sibling of data.operations||[])if(sibling.kind==='sms'&&sibling.batch_id===job.batch_id&&sibling.state==='queued'){
   sibling.state='cancelled';sibling.message='Lote interrompido após '+state+'.';sibling.updated_at=now;
  }
 }
 return {id,branch,report_state:state,accepted:true,state,applied:true};
}

function payloadFor(job,branch,supportsBatch){
 branch=job.__branch||branch;
 let digits=String(job.phone).replace(/\D/g,'');
 if(digits.length===10||digits.length===11)digits='55'+digits;
 if(!/^55[1-9]\d{9,10}$/.test(digits))return null;
 const manual=job.target_type==='contact';
 if((manual?!supportsBatch:!/^024\d{6}$/.test(job.serial))||!validSmsCommand(job.command,manual))return null;
 const created=Math.floor(Date.parse(job.created_at)/1000),phone='+'+digits;
 const result={version:supportsBatch?3:2,id:job.id,branch,serial:job.serial||'',phone,command:job.command,created_at:created,expires_at:created+7200,status_snapshot:'Confirmado pela Central',command_mode:'custom',source_phone_snapshot:phone,apn_snapshot:'',standard_command_snapshot:''};
 if(supportsBatch)Object.assign(result,{target_type:manual?'contact':'device',contact_name:job.contact_name||'',batch_id:job.batch_id||job.id,delay_seconds:job.delay_seconds||0});
 return result;
}

export async function galaxyAndroid({input,token,mobileUser='',document,users}){
 if(!branchIds.has(input.branch))fail(400,'Filial inválida.');
 const doc=await document(input.branch),data=doc.data;
 let userList=null;
 let userListPromise=null;
 const getUsers=async()=>{
  if(!userListPromise)userListPromise=usersFor(users);
  userList=await userListPromise;
  return userList;
 };
 if(mobileUser){
  const account=(await getUsers()).find(u=>u.active&&u.username===mobileUser);
  if(!account||!account.branches?.some(b=>b.id===input.branch)||!(account.permissions?.owner||account.permissions?.writes?.includes('sms')))fail(403,'Conta sem permissão para esta filial ou gateway SMS.');
 }else if(!/^[a-f0-9]{64}$/.test(token||'')||data.gateway?.token_hash!==digest(token))fail(401,'Credencial inválida.');

 const now=new Date().toISOString(),operations=data.operations||[];
 if(input.action==='heartbeat'){
  data.gateway.last_seen=now;data.gateway.ready=false;data.gateway.protocol='android-v3';data.gateway.app_version=String(input.app_version||'0.0.0');
  await doc.save();
  const pending=operations.filter(job=>job.kind==='sms'&&job.state==='queued'&&(!mobileUser||input.global===true||job.actor===mobileUser)).length;
  return {ok:true,connected:true,queued:pending,receivedAt:now};
 }
 if(input.action==='report'){
  const job=operations.find(o=>o.id===input.id&&o.kind==='sms'&&(!mobileUser||input.global===true||o.actor===mobileUser));
  if(input.state==='received'&&!userList)await getUsers();
  const result=applyReport(data,input,job,userList||[],now);
  if(!result.accepted)fail(result.conflict?409:result.error==='Pedido não encontrado.'?404:400,result.error);
  if(result.applied)await doc.save();
  return {ok:true,state:result.state,applied:result.applied,duplicate:result.duplicate===true,stale:result.stale===true};
 }
 if(input.action!=='poll')fail(400,'Ação inválida.');

 const appVersion=String(input.app_version||'0.0.0'),parts=appVersion.split('.').map(Number);
 const supportsBatch=parts.length===3&&parts.every(Number.isInteger)&&(parts[0]>1||parts[0]===1&&parts[1]>=2);
 const supportsSafeRetry=canRetryPayload(input),mobileJobs=operations.filter(job=>job.kind==='sms'&&(!mobileUser||input.global===true||job.actor===mobileUser));
 if(input.global){
  for(const job of mobileJobs){
   if(!['dispatched','received','sending'].includes(job.state))continue;
   const updated=Date.parse(job.updated_at||job.dispatched_at||job.created_at),age=Date.now()-updated;
   const retryUntil=Date.parse(job.dispatch_retry_until||'');
   const stale=job.state==='dispatched'?(Number.isFinite(retryUntil)?retryUntil<=Date.now():age>120000):age>120000;
   if(!stale)continue;
   job.state='indeterminate';job.updated_at=now;job.message='Gateway não confirmou o resultado dentro do prazo; não houve reenvio.';
   if(job.batch_id)for(const sibling of mobileJobs)if(sibling.id!==job.id&&sibling.batch_id===job.batch_id&&sibling.state==='queued'){
    sibling.state='cancelled';sibling.updated_at=now;sibling.message='Lote interrompido após resultado incerto.';
   }
  }
 }
 Object.assign(data.gateway,{last_seen:now,ready:input.ready===true,protocol:supportsBatch?'android-v3':'android-v2',app_version:appVersion});

 const reportResults=[];
 const reports=Array.isArray(input.reports)?input.reports.slice(0,8):[];
 const queued=mobileJobs.some(o=>o.state==='queued');
 if(reports.some(r=>r?.state==='received')||(data.gateway.ready&&queued))await getUsers();
 for(const report of reports){
  const job=mobileJobs.find(o=>o.id===report?.id);
  reportResults.push(applyReport(data,{...report,branch:input.global?report?.branch:(report?.branch||input.branch),device_id:report?.device_id||input.device_id,global:input.global===true},job,userList||[],now));
 }

 const jobs=[];
 const activeStates=new Set(['dispatched','received','sending','sent','indeterminate']);
 for(const job of mobileJobs)if(activeStates.has(job.state)&&Date.now()-Date.parse(job.created_at)<7200000)jobs.push({id:job.id,...(input.global?{branch:job.__branch||input.branch}:{}),state:job.state});

 if(data.gateway.ready){
  const pending=mobileJobs.filter(o=>o.state==='queued').sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||String(a.__branch||input.branch).localeCompare(String(b.__branch||input.branch)));
  const newlyDispatched=new Set();
  if(pending.length){
   const first=pending[0],batch=first.batch_id?pending.filter(o=>o.batch_id===first.batch_id):[first];
   const sameBatchActive=mobileJobs.some(o=>o.batch_id===first.batch_id&&['dispatched','received','sending'].includes(o.state));
   const otherBatchActive=mobileJobs.some(o=>o.batch_id!==first.batch_id&&['dispatched','received','sending'].includes(o.state));
   const deliveries=supportsBatch?batch:[first];
   for(const job of (sameBatchActive||otherBatchActive?[]:deliveries)){
    if(Date.now()-Date.parse(job.created_at)>600000){job.state='expired';job.updated_at=now;continue;}
    if(!authorized(userList,job,job.__branch||input.branch)){job.state='cancelled';job.updated_at=now;job.message='Envio não autorizado.';continue;}
    const payload=payloadFor(job,input.branch,supportsBatch);
    if(!payload){job.state='failed';job.updated_at=now;job.message='Pedido incompatível com Gateway Android atualizado.';continue;}
    job.state='dispatched';job.updated_at=now;job.dispatched_at=now;
    if(supportsSafeRetry){
     job.dispatch_device_id=input.device_id;
     job.dispatch_retry_until=new Date(Date.now()+120000).toISOString();
     job.dispatch_attempts=1;
    }
    newlyDispatched.add(job.id);
    jobs.push({id:job.id,...(input.global?{branch:job.__branch||input.branch}:{}),state:job.state,payload});
   }
  }

  // Retry the immutable payload only for the same device identity and only on the
  // protocol version that persists deduplication before it can send through SmsManager.
  if(supportsSafeRetry){
   for(const job of mobileJobs){
    if(newlyDispatched.has(job.id)||job.state!=='dispatched'||job.dispatch_device_id!==input.device_id||!job.dispatch_retry_until)continue;
    if(Date.parse(job.dispatch_retry_until)<=Date.now()){
     job.state='indeterminate';job.updated_at=now;job.message='Galaxy não confirmou o recebimento; payload não será reenviado.';
     continue;
    }
    const payload=payloadFor(job,input.branch,supportsBatch);
    if(payload){job.dispatch_attempts=(job.dispatch_attempts||0)+1;jobs.push({id:job.id,...(input.global?{branch:job.__branch||input.branch}:{}),state:job.state,payload});}
   }
  }else{
   // Legacy dispatched jobs keep the original at-most-once contract.
   for(const job of mobileJobs){
    if(job.state==='dispatched'&&!job.dispatch_retry_until&&Date.now()-Date.parse(job.updated_at||job.created_at)>120000){
     job.state='indeterminate';job.updated_at=now;job.message='Galaxy não confirmou o recebimento; não houve reenvio.';
    }
   }
  }
 }
 await doc.save();
 return {ok:true,jobs:jobs.slice(-50),report_results:reportResults};
}

export async function galaxyAndroidUnified({input,mobileUser='',gateway,branches,document,users,saveGateway}){
 if(!gateway||gateway.scope!=='all'||!branches.length)fail(401,'Conexão global indisponível.');
 if(input.action==='report'&&!input.branch)fail(400,'Informe a filial do recibo.');
 const docs=new Map();
 for(const branch of branches)if(!branchIds.has(branch))fail(400,'Filial inválida.');
 const loaded=await Promise.all(branches.map(async branch=>[branch,await document(branch)]));
 for(const [branch,doc] of loaded)docs.set(branch,doc);
 const operations=[];
 const originals=new Map();
 for(const [branch,doc] of docs){
  doc.data.operations??=[];
  originals.set(branch,JSON.stringify(doc.data));
  for(const job of doc.data.operations){
   if(job.kind!=='sms')continue;
   Object.defineProperty(job,'__branch',{value:branch,configurable:true});
   operations.push(job);
  }
 }
 const duplicateIds=new Set();
 const seen=new Set();
 for(const job of operations){if(seen.has(job.id))duplicateIds.add(job.id);seen.add(job.id);}
 const uniqueOperations=operations.filter(job=>!duplicateIds.has(job.id));
 const data={gateway:structuredClone(gateway),operations:uniqueOperations};
 const combined={data,save:async()=>{
  for(const [branch,doc] of docs){
   if(JSON.stringify(doc.data)!==originals.get(branch))await doc.save();
  }
  await saveGateway(data.gateway);
 }};
 const anchor=branches.includes(gateway.anchor_branch)?gateway.anchor_branch:branches[0];
 if(!branchIds.has(anchor))fail(400,'Filial inválida.');
 const inputWithBranch={...input,branch:input.action==='report'?(input.branch||anchor):anchor,global:true};
 return galaxyAndroid({input:inputWithBranch,mobileUser,document:async()=>combined,users});
}
