export function smsPhone(value){
 const digits=String(value||'').replace(/\D/g,'');
 const phone='+'+(digits.startsWith('55')?digits:'55'+digits);
 return /^\+55[1-9]\d{9,10}$/.test(phone)?phone:'';
}
export const validSmsCommand=value=>typeof value==='string'&&/^[\x20-\x7e]{1,160}$/.test(value)&&!!value.trim();
export function smsCanSend({phone,connected,validatedAt,command,submitting,now=Date.now()}){
 return !!smsPhone(phone)&&connected===true&&now-validatedAt<90000&&validSmsCommand(command)&&!submitting;
}
export function smsSubmissionOutcome(result,error){
 if(error){const certain=[400,401,403,404,409,422,429].includes(error.status);return {kind:certain?'error':'pending',message:certain?'Pedido não incluído na fila: '+error.message:'Confirmação pendente. Confira o histórico antes de tentar novamente.'};}
 if(result?.ok===false||['failed','expired','cancelled'].includes(result?.state))return {kind:'error',message:result?.message||'O pedido não foi confirmado na fila.'};
 if(result?.ok!==true||!result?.id||result?.pending||result?.state==='indeterminate')return {kind:'pending',message:'Confirmação pendente. Confira o histórico antes de tentar novamente.'};
 return {kind:'success',message:result.state==='queued'?'Pedido adicionado à fila. Aguardando envio pelo Galaxy.':result.message||'Pedido registrado. Acompanhe o estado no histórico.'};
}
