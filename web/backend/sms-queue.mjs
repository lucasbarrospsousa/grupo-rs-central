export const smsStates=['received','sending','sent','delivered','failed','cancelled','expired','indeterminate'];
export async function bridgeHealth(c,branch){
 const r=(await c.query('select healthy,checked_at,details from central_homologacao.sms_bridge_status where branch_id=$1',[branch])).rows[0];
 const connected=!!r?.healthy&&Date.now()-new Date(r.checked_at).getTime()<90000,cloud=r?.details?.mode==='cloud';
 return {ok:connected&&(!cloud||r.details.send_enabled===true),connected,mode:cloud?'cloud':'local',send_enabled:cloud?r.details.send_enabled:null,checked_at:r?.checked_at||null,...(connected&&cloud&&!r.details.send_enabled?{error:'Gateway conectado em modo diagnóstico. Habilite o envio no celular para enviar SMS.'}:{})};
}
// A committed attempt is never sent again, including after a crash or timeout.
export async function processSms(op,{claim,save,gateway,now=()=>Math.floor(Date.now()/1000)}){
 if(op.result?.cloud_device)return;
 if(!op.result?.bridge_attempted_at){
  if(op.payload.expires_at<=now()){await save(op,'expired',{message:'Validade encerrada antes do envio.'});return;}
  if(!await claim(op))return;
  try{const r=await gateway({action:'send',id:op.id,payload:op.payload});if(r.ok&&smsStates.includes(r.state))await save(op,r.state,r);}catch{}
  return;
 }
 try{const r=await gateway({action:'read',id:op.id});if(r.ok&&smsStates.includes(r.state))await save(op,r.state,r);}catch{}
}
