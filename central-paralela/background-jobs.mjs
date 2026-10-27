import {collectorIntervals} from './global-collectors.mjs';
export function nextWindow(job,now){
 if(job.kind!=='codes'||!job.nightly_enabled)return now;
 const minute=Math.floor((now-3*3600000)/60000)%1440,parse=v=>Number(v.slice(0,2))*60+Number(v.slice(3));
 const start=parse(job.night_start),end=parse(job.night_end),inside=start<end?minute>=start&&minute<end:minute>=start||minute<end;
 return inside?now:now+((start-minute+1440)%1440)*60000;
}
// Scheduling metadata only lives in DO storage. All results remain in Drive.
export class BackgroundJobs {
 constructor({storage,users,run,now=()=>Date.now()}){Object.assign(this,{storage,users,run,now});}
 async configure(input,user){
  if(!user?.permissions?.owner||!user.branches?.some(b=>b.id===input.branch))throw Object.assign(Error('Somente administrador da filial.'),{status:403});
  if(!['status',...Object.keys(collectorIntervals)].includes(input.kind))throw Object.assign(Error('Rotina inválida.'),{status:400});
  if(['costs','warehouse-links'].includes(input.kind)&&input.branch!=='imperatriz')throw Object.assign(Error('Rotina global administrada por Imperatriz.'),{status:400});
  const id='job:'+input.branch+':'+input.kind;
  if(input.action==='read')return (await this.storage.get(id))||{enabled:false};
  if(input.action!=='configure'||typeof input.enabled!=='boolean'||input.enabled&&input.confirmed!==true)throw Object.assign(Error('Confirme a ativação da rotina.'),{status:400});
  if(['costs','warehouse-links'].includes(input.kind)&&!['imperatriz','araguaina','acailandia','maraba'].every(id=>user.branches.some(b=>b.id===id)))throw Object.assign(Error('Rotina global exige acesso às quatro filiais.'),{status:403});
  if(input.kind==='status'&&(!Array.isArray(input.serials)||input.serials.length>50||input.serials.some(s=>!/^\d{6,17}$/.test(s))||input.enabled&&!input.serials.length))throw Object.assign(Error('Selecione até 50 aparelhos.'),{status:400});
  if(input.kind==='codes'&&(input.nightly_enabled!==undefined&&typeof input.nightly_enabled!=='boolean'||input.nightly_enabled&&(![input.night_start,input.night_end].every(v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v||''))||input.night_start===input.night_end)||input.interval_seconds!==undefined&&(!Number.isInteger(input.interval_seconds)||input.interval_seconds<25||input.interval_seconds>3600)))throw Object.assign(Error('Confira a janela noturna e intervalo de 25 a 3600 segundos.'),{status:400});
  const job={nightly_enabled:input.kind==='codes'&&input.nightly_enabled===true,night_start:input.night_start||'22:00',night_end:input.night_end||'06:00',interval_seconds:input.interval_seconds||25,branch:input.branch,kind:input.kind,enabled:input.enabled,serials:[...new Set(input.serials||[])],actor:user.username,cursor:0,due:this.now()+1300,updatedAt:new Date(this.now()).toISOString()};
  await this.storage.put(id,job);if(job.enabled)await this.storage.setAlarm(job.due);return job;
 }
 async alarm(){
  const all=await this.storage.list({prefix:'job:'}),jobs=[...all.entries()].filter(([,j])=>j.enabled).sort((a,b)=>a[1].due-b[1].due);
  if(!jobs.length)return;
  const [id,j]=jobs[0];if(j.due>this.now()){await this.storage.setAlarm(j.due);return;}
  try{
   const u=(await this.users()).users.find(u=>u.active&&u.username===j.actor);
   if(!u?.permissions?.owner||!u.branches?.some(b=>b.id===j.branch)||(['costs','warehouse-links'].includes(j.kind)&&!['imperatriz','araguaina','acailandia','maraba'].every(id=>u.branches.some(b=>b.id===id)))){j.enabled=false;j.error='Permissão revogada';}
   else if(nextWindow(j,this.now())>this.now()){j.due=nextWindow(j,this.now());}
   else{const result=await this.run(j);j.cursor=result.finished?0:j.cursor+1;j.lastProcessed=new Date(this.now()).toISOString();if(result.finished)j.lastCompleted=j.lastProcessed;j.error=null;j.due=this.now()+(result.finished?(j.kind==='status'?30000:collectorIntervals[j.kind]):j.kind==='codes'?j.interval_seconds*1000:1300);}
  }catch(e){j.error='Rotina aguardando nova tentativa';j.due=this.now()+(e.credentialInvalid?900000:e.status===429||e.upstreamStatus===429?120000:60000);}
  await this.storage.put(id,j);
  const pending=[...await this.storage.list({prefix:'job:'})].map(([,j])=>j).filter(j=>j.enabled);if(pending.length)await this.storage.setAlarm(Math.max(this.now()+1300,Math.min(...pending.map(j=>j.due))));
 }
}
