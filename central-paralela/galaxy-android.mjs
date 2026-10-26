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
 Object.assign(data.gateway,{last_seen:now,ready:input.ready===true,protocol:'android-v2'});
 const jobs=[];
 // Existing IDs request receipts only. Never retransmit a dispatched payload.
 for(const job of data.operations||[])if(job.kind==='sms'&&['dispatched','received','sending','sent'].includes(job.state)&&Date.now()-Date.parse(job.created_at)<7200000)jobs.push({id:job.id,state:job.state});
 if(data.gateway.ready){
  const job=data.operations?.find(o=>o.kind==='sms'&&o.state==='queued');
  if(job){
   let digits=String(job.phone).replace(/\D/g,'');if(digits.length===10||digits.length===11)digits='55'+digits;
   if(Date.now()-Date.parse(job.created_at)>600000){job.state='expired';}
   else if(!await authorized(job)){job.state='cancelled';}
   else if(!/^024\d{6}$/.test(job.serial)||!/^55[1-9]\d{9,10}$/.test(digits)||!/^[\x20-\x7e]{1,160}$/.test(job.command)){job.state='failed';job.message='Pedido incompatível com Gateway Android.';}
   else{
    const created=Math.floor(Date.parse(job.created_at)/1000),phone='+'+digits;
    job.state='dispatched';job.updated_at=now;
    jobs.push({id:job.id,state:job.state,payload:{version:2,id:job.id,branch:input.branch,serial:job.serial,phone,command:job.command,created_at:created,expires_at:created+7200,status_snapshot:'Confirmado pela Central',command_mode:'custom',source_phone_snapshot:phone,apn_snapshot:'',standard_command_snapshot:''}});
   }
  }
 }
 await doc.save();return {ok:true,jobs:jobs.slice(-50)};
}
