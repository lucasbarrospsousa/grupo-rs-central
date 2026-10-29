// Durable dispatch receipt: an uncertain dispatch is never automatically sent twice.
export async function whatsappQueue(storage,b,now=Date.now()) {
 const reply=(status,data)=>Response.json(data,{status});
 const state=await storage.get('wa:device')||{};
 const online=state.ok===true&&state.connected===true&&now-(state.lastHeartbeat||0)<45000;
 if(b.action==='gateway-heartbeat'){await storage.put('wa:device',{...(b.deviceStatus||{}),lastHeartbeat:now});return reply(200,{ok:true});}
 if(['status','check-usb'].includes(b.action))return reply(200,{ok:true,connected:online,device:{model:state.model||'Galaxy',status:online?'online':'offline',connection:'mobile-app',app:state.whatsappPackage||'com.whatsapp.w4b'},lastHeartbeat:state.lastHeartbeat||0,error:online?null:'Galaxy sem comunicação recente. Abra o aplicativo de disparos.'});
 if(b.action==='gateway-poll')return storage.transaction(async tx=>{const jobs=await tx.list({prefix:'wa:job:'});for(const [key,j] of jobs){if(j.status!=='queued')continue;if(now-j.timestamp>60000){await tx.put(key,{...j,status:'expired'});continue;}await tx.put(key,{...j,status:'dispatched'});return reply(200,{ok:true,job:j});}return reply(200,{ok:true,job:null});});
 if(b.action==='gateway-report'){if(!/^[-a-zA-Z0-9_]{1,100}$/.test(b.id||''))return reply(400,{error:'Identificador inválido.'});return storage.transaction(async tx=>{const key='wa:job:'+b.id,j=await tx.get(key);if(!j)return reply(404,{error:'Envio não encontrado.'});if(j.status==='dispatched')await tx.put(key,{...j,status:b.status==='sent'&&b.confirmed===true?'sent':'unconfirmed'});return reply(200,{ok:true});});}
 if(!['send','result'].includes(b.action))return reply(400,{error:'Ação desconhecida.'});
 const id=b.requestId;if(!/^[-a-zA-Z0-9_]{1,100}$/.test(id||''))return reply(400,{error:'Identificador de envio obrigatório.'});
 return storage.transaction(async tx=>{const key='wa:job:'+id;let j=await tx.get(key);
 if(!j&&b.action==='result')return reply(404,{error:'Envio não encontrado.'});
 if(!j){if(!online||state.accessibilityActive===false)return reply(409,{error:'Galaxy indisponível. Abra o aplicativo e habilite a acessibilidade antes de enviar.'});if(!/^\d{12,13}$/.test(b.phone||'')||!b.message?.trim()||b.message.length>3000)return reply(400,{error:'Telefone ou mensagem inválidos.'});j={id,phone:b.phone,name:b.name||'',message:b.message,timestamp:now,status:'queued'};await tx.put(key,j);}
 if(b.action==='send'&&(j.phone!==b.phone||j.message!==b.message))return reply(409,{error:'Identificador já utilizado em outro envio.'});
 if(j.status==='sent')return reply(200,{ok:true,confirmed:true,status:'sent',id});
 if(['expired','unconfirmed'].includes(j.status))return reply(409,{error:'Envio sem confirmação. Confira a conversa no Galaxy antes de qualquer novo disparo.',id,status:j.status});
 return reply(202,{ok:true,confirmed:false,status:j.status,id});});
}
