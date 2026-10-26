// Scheduling metadata only lives in DO storage. All results remain in Drive.
export class BackgroundJobs {
 constructor({storage,users,run,now=()=>Date.now()}){Object.assign(this,{storage,users,run,now});}
 async configure(input,user){
  if(!user?.permissions?.owner||!user.branches?.some(b=>b.id===input.branch))throw Object.assign(Error('Somente administrador da filial.'),{status:403});
  if(!['status','warehouse'].includes(input.kind))throw Object.assign(Error('Rotina inválida.'),{status:400});
  const id='job:'+input.branch+':'+input.kind;
  if(input.action==='read')return (await this.storage.get(id))||{enabled:false};
  if(input.action!=='configure'||typeof input.enabled!=='boolean'||input.enabled&&input.confirmed!==true)throw Object.assign(Error('Confirme a ativação da rotina.'),{status:400});
  if(input.kind==='status'&&(!Array.isArray(input.serials)||input.serials.length>50||input.serials.some(s=>!/^\d{6,17}$/.test(s))||input.enabled&&!input.serials.length))throw Object.assign(Error('Selecione até 50 aparelhos.'),{status:400});
  const job={branch:input.branch,kind:input.kind,enabled:input.enabled,serials:[...new Set(input.serials||[])],actor:user.username,cursor:0,due:this.now()+1300,updatedAt:new Date(this.now()).toISOString()};
  await this.storage.put(id,job);if(job.enabled)await this.storage.setAlarm(job.due);return job;
 }
 async alarm(){
  const all=await this.storage.list({prefix:'job:'}),jobs=[...all.entries()].filter(([,j])=>j.enabled).sort((a,b)=>a[1].due-b[1].due);
  if(!jobs.length)return;
  const [id,j]=jobs[0];if(j.due>this.now()){await this.storage.setAlarm(j.due);return;}
  try{
   const u=(await this.users()).users.find(u=>u.active&&u.username===j.actor);
   if(!u?.permissions?.owner||!u.branches?.some(b=>b.id===j.branch)){j.enabled=false;j.error='Permissão revogada';}
   else{const result=await this.run(j);j.cursor=result.finished?0:j.cursor+1;j.lastCompleted=new Date(this.now()).toISOString();j.error=null;j.due=this.now()+(result.finished?(j.kind==='status'?30000:180000):1300);}
  }catch(e){j.error='Rotina aguardando nova tentativa';j.due=this.now()+60000;}
  await this.storage.put(id,j);
  const pending=[...await this.storage.list({prefix:'job:'})].map(([,j])=>j).filter(j=>j.enabled);if(pending.length)await this.storage.setAlarm(Math.max(this.now()+1300,Math.min(...pending.map(j=>j.due))));
 }
}
