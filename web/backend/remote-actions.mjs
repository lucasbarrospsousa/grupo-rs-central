import {randomUUID} from 'node:crypto';
import {bridgeHealth} from './sms-queue.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export async function scoped(pool,user,fn){const c=await pool.connect();try{await c.query('BEGIN');await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function remoteAction({action,body,branch,user,role,pool,service}){
 if(role==='reader')throw fail(403,'Usuário somente de leitura.');
 if(!['link','sms','reconcile'].includes(action))throw fail(404,'Operação inválida.');
 if(action==='reconcile'){
  const op=await scoped(pool,user,async c=>(await c.query('select * from central_homologacao.remote_operations where id=$1 and branch_id=$2',[body.id,branch])).rows[0]);if(!op)throw fail(404,'Pedido não encontrado.');return reconcile(op,{pool,user,service});
 }
 if(!body.confirmed)throw fail(400,'Revise e confirme a operação.');
 const device=await scoped(pool,user,async c=>(await c.query('select * from central_homologacao.devices where id=$1 and branch_id=$2 and deleted_at is null',[body.id,branch])).rows[0]);
 if(!device||device.version!==body.version)throw fail(409,'Cadastro mudou. Consulte novamente.');
 const existing=await scoped(pool,user,async c=>(await c.query("select * from central_homologacao.remote_operations where branch_id=$1 and kind=$2 and serial=$3 and state in ('prepared','submitted','queued','pending','received','sending','indeterminate')",[branch,action,device.serial])).rows[0]);if(existing)return reconcile(existing,{pool,user,service});
 let payload;
 if(action==='link'){
  if(!['Reserva','Manutenção'].includes(device.data.status))throw fail(409,'Selecione um aparelho em Reserva ou Manutenção.');
  const prepared=await service.prepareLink(branch,device.serial,String(body.plate||''));payload={...prepared,device_id:device.id,version:device.version};
 }else{
  if(branch!=='imperatriz'||!/^024\d{6}$/.test(device.serial))throw fail(422,'SMS disponível para aparelhos 024 de Imperatriz.');
  if(typeof body.command!=='string'||!/^[\x20-\x7e]{1,160}$/.test(body.command)||!body.command.trim())throw fail(400,'Use texto simples com até 160 caracteres.');
  const remote=await service.equipmentPortal(branch,device.serial);const digits=String(remote.phone||'').replace(/\D/g,''),phone='+'+(digits.startsWith('55')?digits:'55'+digits);if(!/^\+55[1-9]\d{9,10}$/.test(phone)||body.phone!==phone)throw fail(409,'Telefone não confirmado ou mudou. Consulte novamente.');
  const health=await scoped(pool,user,c=>bridgeHealth(c,branch));if(!health.ok)throw fail(503,health.error||'Galaxy indisponível.');const now=Math.floor(Date.now()/1000);payload={version:2,branch,serial:device.serial,phone,command:body.command,command_mode:'custom',source_phone_snapshot:phone,apn_snapshot:'',standard_command_snapshot:'',status_snapshot:device.data.status,created_at:now,expires_at:now+7200};
 }
 const id=randomUUID();if(action==='sms')payload.id=id;
 // Durable fence is committed before touching the remote service. A timeout never causes a second POST/PUT.
 const op=await scoped(pool,user,async c=>{const fresh=(await c.query('select version from central_homologacao.devices where id=$1 and deleted_at is null for update',[device.id])).rows[0];if(fresh?.version!==device.version)throw fail(409,'Cadastro mudou durante a revisão.');const row=(await c.query("insert into central_homologacao.remote_operations(id,user_id,branch_id,kind,serial,payload,state) values($1,$2,$3,$4,$5,$6,$7) returning *",[id,user.user_id,branch,action,device.serial,payload,action==='sms'?'queued':'submitted'])).rows[0];await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'PREPARE_'+action.toUpperCase(),id,{device:device.id}]);return row;});
 try{if(action==='link'&&!payload.confirmed)await service.createLink(branch,payload.payload);}catch{/* Ambiguous response is reconciled by reads only. */}
 return reconcile(op,{pool,user,service});
}
async function reconcile(op,{pool,user,service}){
 if(op.state==='confirmed')return{ok:true,id:op.id,message:'Vínculo já confirmado; nenhuma gravação repetida.'};
 let result;try{
  if(op.kind==='link'){
   const confirmed=await service.prepareLink(op.branch_id,op.serial,op.payload.plate);if(!confirmed.confirmed)return{ok:false,pending:true,id:op.id,message:'Vínculo ainda não confirmado. Nenhum envio será repetido.'};
   result=await scoped(pool,user,async c=>{const locked=(await c.query('select state from central_homologacao.remote_operations where id=$1 for update',[op.id])).rows[0];if(locked?.state==='confirmed')return{ok:true,id:op.id,message:'Vínculo já confirmado.'};const r=await c.query("update central_homologacao.devices set data=data||$3::jsonb,version=version+1,updated_at=now() where id=$1 and version=$2 and deleted_at is null returning id",[op.payload.device_id,op.payload.version,JSON.stringify({status:'Estoque',identification:op.payload.plate,plate:'',client:'RS300',installed_at:''})]);if(!r.rowCount){const current=(await c.query('select data from central_homologacao.devices where id=$1',[op.payload.device_id])).rows[0];if(current?.data.status!=='Estoque'||current.data.identification!==op.payload.plate)throw fail(409,'Vínculo remoto confirmado; cadastro local mudou. Revisão necessária.');}await c.query("update central_homologacao.remote_operations set state='confirmed',updated_at=now() where id=$1",[op.id]);await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[op.branch_id,user.user_id,'CONFIRM_LINK',op.id,{device:op.payload.device_id}]);return{ok:true,id:op.id,message:'Vínculo confirmado com RS300 e Estoque salvo no SQL.'};});
  }else{result={ok:true,id:op.id,state:op.state,message:op.state==='queued'?'Pedido registrado. Aguardando o Galaxy.':'Estado: '+op.state+'. Nenhum reenvio automático.'};}
 }catch(e){return{ok:false,pending:true,id:op.id,message:e.message};}return result;
}
