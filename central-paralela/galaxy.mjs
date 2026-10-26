import {trackingDocument,driveUsers} from './drive.mjs';
import {digest,decryptUsers,randomToken} from './auth-crypto.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
// Pull-only, private pairing. Delivered jobs are never automatically redelivered.
export async function galaxy({input,token,config,key,document=trackingDocument,users=async()=>decryptUsers(await driveUsers(config),key)}){
 if(!/^[a-f0-9]{64}$/.test(token||''))fail(401,'Credencial inválida.');
 const doc=await document(config,input.branch),data=doc.data;
 if(!data.gateway||data.gateway.token_hash!==digest(token))fail(401,'Credencial inválida.');
 const now=new Date().toISOString();data.gateway.last_seen=now;
 if(input.action==='ack'){
  const op=data.operations?.find(o=>o.id===input.id&&o.kind==='sms');
  if(!op||op.lease!==input.lease||!['sent','delivered','failed','indeterminate'].includes(input.state))fail(400,'Retorno inválido.');
  if(['sent','delivered','failed','indeterminate'].includes(op.state)&&op.state!==input.state&&!(op.state==='sent'&&input.state==='delivered'))fail(409,'Retorno já registrado.');
  op.state=input.state;op.updated_at=now;op.message='Retorno do Galaxy: '+input.state;await doc.save();return {ok:true};
 }
 if(input.action!=='poll')fail(400,'Ação inválida.');
 const job=data.operations?.find(o=>o.kind==='sms'&&o.state==='queued');
 if(!job){await doc.save();return {ok:true,job:null};}
 const account=(await users()).users.find(u=>u.active&&u.username===job.actor);
 if(!account||!account.branches?.some(b=>b.id===input.branch)||!(account.permissions?.owner||account.permissions?.writes?.includes('sms'))){job.state='cancelled';job.message='Acesso do solicitante revogado.';await doc.save();return {ok:true,job:null};}
 if(Date.now()-Date.parse(job.created_at)>600000){job.state='expired';job.message='Prazo de dez minutos expirou.';await doc.save();return {ok:true,job:null};}
 job.state='dispatched';job.lease=randomToken();job.updated_at=now;job.message='Entregue ao Galaxy; aguarda confirmação. Não reenviar.';
 await doc.save();return {ok:true,job:{id:job.id,lease:job.lease,phone:job.phone,command:job.command,serial:job.serial}};
}
