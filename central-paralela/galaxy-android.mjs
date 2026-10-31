import {digest} from './auth-crypto.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const allowed={dispatched:['received','failed','expired','indeterminate'],received:['received','sending','sent','failed','expired','indeterminate'],sending:['sending','sent','failed','indeterminate'],sent:['sent','delivered','failed'],delivered:['delivered'],failed:['failed'],expired:['expired'],indeterminate:['indeterminate']};
export async function galaxyAndroid({input,token,document,users}){
 const doc=await document(input.branch),data=doc.data;
 if(!/^[a-f0-9]{64}$/.test(token||'')||data.gateway?.token_hash!==digest(token))fail(401,'Credencial inválida.');
 const now=new Date().toISOString();
 const authorized=async job=>(await users()).users.some(u=>u.active&&u.username===job.actor&&u.branches?.some(b=>b.id===input.branch)&&(u.permissions?.owner||u.permissions?.writes?.includes('sms')));
 if(input.action==='report'){
  const job=data.operations?.find(o=>o.id===input.id&&o.kind==='sms');
  if(!job||!allowed[job.state]?.includes(input.state))fail(409,'Transição inválida.');
  if(input.state==='received'&&(!data.gateway.ready||!await authorized(job)||Date.now()-Date.parse(job.created_at)>600000)){job.state='cancelled';job.message='Envio não autorizado.';}else{job.state=input.state;job.message='Retorno do Galaxy: '+input.state;}
  job.updated_at=now;await doc.save();return {ok:true,state:job.state};
 }
 if(input.action!=='poll')fail(400,'Ação inválida.');
 const appVersion=String(input.app_version||'0.0.0'),versionParts=appVersion.split('.').map(Number),supportsBatch=versionParts.length===3&&versionParts.every(Number.isInteger)&&(versionParts[0]>1||versionParts[0]===1&&versionParts[1]>=2);
 Object.assign(data.gateway,{last_seen:now,ready:input.ready===true,protocol:supportsBatch?'android-v3':'android-v2',app_version:appVersion});
 const jobs=[];
 // Existing IDs request receipts only. Never retransmit a dispatched payload.
 for(const job of data.operations||[])if(job.kind==='sms'&&['dispatched','received','sending','sent'].includes(job.state)&&Date.now()-Date.parse(job.created_at)<7200000)jobs.push({id:job.id,state:job.state});
 if(data.gateway.ready){
  const queued=(data.operations||[]).filter(o=>o.kind==='sms'&&o.state==='queued');
  if(queued.length){
   const first=queued[0],batch=first.batch_id?queued.filter(o=>o.batch_id===first.batch_id):[first];
   const deliveries=supportsBatch?batch:[first];
   for(const job of deliveries){
    let digits=String(job.phone).replace(/\D/g,'');if(digits.length===10||digits.length===11)digits='55'+digits;
    if(Date.now()-Date.parse(job.created_at)>600000){job.state='expired';continue;}
    if(!await authorized(job)){job.state='cancelled';continue;}
    const manual=job.target_type==='contact';
    if((manual?!supportsBatch:!/^024\d{6}$/.test(job.serial))||!/^55[1-9]\d{9,10}$/.test(digits)||!/^[\x20-\x7e]{1,160}$/.test(job.command)){job.state='failed';job.message='Pedido incompatível com Gateway Android atualizado.';continue;}
    const created=Math.floor(Date.parse(job.created_at)/1000),phone='+'+digits;
    job.state='dispatched';job.updated_at=now;
    const payload={version:supportsBatch?3:2,id:job.id,branch:input.branch,serial:job.serial||'',phone,command:job.command,created_at:created,expires_at:created+7200,status_snapshot:'Confirmado pela Central',command_mode:'custom',source_phone_snapshot:phone,apn_snapshot:'',standard_command_snapshot:''};
    if(supportsBatch)Object.assign(payload,{target_type:manual?'contact':'device',contact_name:job.contact_name||'',batch_id:job.batch_id||job.id,delay_seconds:job.delay_seconds||0});
    jobs.push({id:job.id,state:job.state,payload});
   }
  }
 }
 await doc.save();return {ok:true,jobs:jobs.slice(-50)};
}
