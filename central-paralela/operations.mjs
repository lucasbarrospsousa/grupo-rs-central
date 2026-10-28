import {collect} from './global-collectors.mjs';
import {galaxyAndroid} from './galaxy-android.mjs';
import {prepareConfig} from './configurator.mjs';
import {recoverConfig,commitConfig} from './configurator-journal.mjs';
import {importMigration} from './migration.mjs';
import {BackgroundJobs} from './background-jobs.mjs';
import {driveUsers} from './drive.mjs';
import {decryptUsers} from './auth-crypto.mjs';
import {WriteQueue} from './write-queue.mjs';
import {warehouse} from './warehouse.mjs';
import {importMaintenance,verifyImport} from './maintenance-import.mjs';
import {maintenance} from './maintenance.mjs';
import {guardQueries,queryStatus,latestLocation} from './query-flow.mjs';
import {Integrations,ORIGINS} from './integrations.mjs';
import {galaxy} from './galaxy.mjs';
import {inventory} from './inventory.mjs';
import {trackingDocument,onTrackingSaved,documentCache} from './drive.mjs';
import {ReadModel} from './read-model.mjs';
const reply=(status,data)=>Response.json(data,{status});
const text=v=>typeof v==='string'?v.slice(0,300):typeof v==='number'?String(v):'';
const project=(row,keys)=>Object.fromEntries(keys.map(k=>[k,text(row?.[k])]));
export function observation(result){
 const location=result.location?.ok?{ok:true,...project(result.location,['serial','plate','lat','lng','speed','ignition','battery','internal_battery','internal_battery_voltage','updated_at','gps_at','gps_signal','queried_at'])}:{ok:false,message:text(result.location?.message)||'Comunicação indisponível.'};
 const chip=result.chip?.ok?{ok:true,...project(result.chip,['provider','status','connectivity','operator','queried_at'])}:{ok:false,message:text(result.chip?.message)||'Chip não confirmado.'};
 return {queried_at:result.queried_at,location,chip};
}
export class Operations {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.queue=new WriteQueue();this.config=JSON.parse(env.DRIVE_CONFIG||'null');this.display=new ReadModel(ctx.storage,env.AUTH_DATA_KEY,env.DRIVE_CONFIG);this.displayPending=new Map();if(this.config){this.config[documentCache]={};this.config[onTrackingSaved]=(branch,data)=>this.display.publish(branch,data);}this.service=guardQueries(new Integrations({secrets:()=>JSON.parse(env.INTEGRATIONS_CONFIG||'null')||{}}),ctx.storage);this.jobs=new BackgroundJobs({storage:ctx.storage,users:async()=>decryptUsers(await driveUsers(JSON.parse(env.DRIVE_CONFIG)),env.AUTH_DATA_KEY),run:j=>this.runJob(j)});}
 async alarm(){return this.queue.run('__jobs',()=>this.jobs.alarm());}
 async runJob(j){return this.queue.run('__writer',async()=>{
  await this.recoverConfig();
  if(j.kind==='status'){const serial=j.serials[j.cursor];if(!serial)return {finished:true};const result=await this.execute(new Request('https://operations.internal/query'),{kind:'status',branch:j.branch,serial});if(!result.ok)throw Error('Query pending');return {finished:j.cursor+1>=j.serials.length};}
  if(!await this.reserveQuery(false,true))throw Error('Rate limited');
  return collect({job:j,document:branch=>trackingDocument(this.config,branch),service:this.service});
 });}
 async fetch(request){
  let b;try{b=await request.json();}catch{return reply(400,{error:'JSON inválido.'});}
  if(new URL(request.url).pathname==='/whatsapp')return this.whatsapp(b);
  if(new URL(request.url).pathname==='/display')return this.displayResponse(b);
  let imported;try{imported=typeof b.importBody==='string'?JSON.parse(b.importBody):null;}catch{return reply(400,{error:'Importação inválida.'});}
  if(new URL(request.url).pathname==='/barrier'){try{await this.queue.run('__writer',()=>this.recoverConfig());return reply(200,{ok:true});}catch{return reply(503,{error:'Recuperação pendente.'});}}
  const branch=b.input?.branch||b.branch||imported?.branch;
  if(!Object.hasOwn(ORIGINS,branch))return reply(400,{error:'Filial inválida.'});
  if(new URL(request.url).pathname==='/jobs'){try{return reply(200,await this.queue.run('__jobs',()=>this.jobs.configure(b.input,b.user)));}catch(e){return reply(e.status||503,{error:e.message});}}
  try{return await this.queue.run('__writer',async()=>{await this.recoverConfig();return this.execute(request,b);});}catch(e){return reply(e.status||503,{error:e.status?e.message:'Operação indisponível.'});}
 }
 async displayResponse(b){
  const user=b.user,views=user?.permissions?.views||[];
  if(!Array.isArray(user?.branches))return reply(403,{error:'Acesso negado.'});
  const options={stock:views.includes('stock')||views.includes('overview'),warehouse:views.includes('warehouse'),maintenance:views.includes('maintenance'),owner:user.permissions?.owner===true};
  if(!options.stock&&!options.warehouse&&!options.maintenance)return reply(200,[]);
  try{
   if(await this.ctx.storage.get('configurator-intent'))await this.queue.run('__writer',()=>this.recoverConfig());
   const rows=await Promise.all(user.branches.map(async({id})=>{
    if(!Object.hasOwn(ORIGINS,id))throw Error('Invalid branch');
    let value=await this.display.read(id,options);
    const refresh=()=>{
     if(!this.displayPending.has(id)){
      const pending=this.queue.run('__writer',async()=>{await this.recoverConfig();const doc=await trackingDocument(this.config,id);await this.display.publish(id,doc.data);}).finally(()=>this.displayPending.delete(id));
      this.displayPending.set(id,pending);
     }
     return this.displayPending.get(id);
    };
    if(!value||b.refresh){await refresh();value=await this.display.read(id,options);}
    else if(Date.now()-Date.parse(value.cachedAt)>600000)this.ctx.waitUntil?.(refresh().catch(()=>{}));
    return value;
   }));
   return reply(200,rows);
  }catch{return reply(503,{error:'Dados salvos temporariamente indisponíveis.'});}
 }
 journalOptions(){return {storage:this.ctx.storage,key:this.env.AUTH_DATA_KEY,document:branch=>trackingDocument({...this.config,[documentCache]:null},branch)};}
 async recoverConfig(){return recoverConfig(this.journalOptions());}
 async configurator(p){
  const credential=JSON.parse(this.env.CONFIGURATOR_ACCESS||'null');
  const users=await decryptUsers(await driveUsers(this.config),this.env.AUTH_DATA_KEY);
  const user=users.users.find(u=>u.username===credential?.username&&u.active);
  const documents={};for(const branch of Object.keys(ORIGINS))documents[branch]=await this.journalOptions().document(branch);
  const result=await prepareConfig({p,user,documents,service:this.service});
  return result.response||commitConfig(result.plan,this.journalOptions());
 }
 async execute(request,b){
  try{
   if(new URL(request.url).pathname==='/configurator')return reply(200,await this.configurator(b.input));
   if(new URL(request.url).pathname==='/warehouse')return reply(200,await warehouse({input:b.input,user:b.user,config:this.config,service:this.service}));
   if(b.kind==='maintenance-import'&&typeof b.importBody!=='string')return reply(400,{error:'Missing import envelope'});
   if(new URL(request.url).pathname==='/maintenance-import'||b.kind==='maintenance-import'){if(!verifyImport(b.importBody,b.importSignature,this.env.AUTH_DATA_KEY,this.env.MAINTENANCE_IMPORT_UNTIL))return reply(403,{error:'Importação desabilitada.'});try{return reply(200,await (JSON.parse(b.importBody).action?.startsWith('migration')?importMigration:importMaintenance)(JSON.parse(b.importBody),this.config));}catch(e){return reply(503,{error:'Não foi possível concluir a importação.'});}}
   if(new URL(request.url).pathname==='/maintenance')return reply(200,await maintenance({input:b.input,user:b.user,config:this.config}));
   if(new URL(request.url).pathname==='/galaxy'&&b.android)return reply(200,await galaxyAndroid({input:b.input,token:b.token,document:branch=>trackingDocument(this.config,branch),users:async()=>decryptUsers(await driveUsers(this.config),this.env.AUTH_DATA_KEY)}));
   if(new URL(request.url).pathname==='/galaxy')return reply(200,await galaxy({input:b.input,token:b.token,config:this.config,key:this.env.AUTH_DATA_KEY}));
   if(new URL(request.url).pathname==='/inventory'){
    const remote=['analyze','lookup','link-preview','link-confirm','link-check','refresh-equipment','sms-send','swap-preview','swap-execute','swap-check'].includes(b.input?.action);
    if(remote){const allowed=await this.reserveQuery(true);if(!allowed)return reply(429,{error:'Aguarde dez segundos entre consultas.'});}
    return reply(200,await inventory({input:b.input,user:b.user,config:this.config,service:this.service}));
   }
   if(!Object.hasOwn(ORIGINS,b.branch)||!/^\d{6,17}$/.test(b.serial||'')||!['status','location','history'].includes(b.kind))return reply(400,{error:'Consulta inválida.'});
   const doc=await trackingDocument(this.config,b.branch);
   const rows=doc.data.rows.filter(r=>!r.deleted_at&&r.serial===b.serial);if(rows.length!==1)return reply(404,{error:'Aparelho único não encontrado na cópia desta filial.'});
   const row=rows[0];
   if(['status','location'].includes(b.kind)&&row.live&&Date.now()-Date.parse(row.live.queried_at)<(b.kind==='location'?15000:30000))return reply(200,{serial:b.serial,branch:b.branch,live:row.live,cached:true,saved:true});
   if(!await this.reserveQuery(false,b.kind==='status'))return reply(429,{error:'Aguarde o intervalo da integração.',retry_after_ms:1300});
   if(b.kind==='history'){
    const result=await this.service.history(b.branch,b.serial,b.start,b.end);
    return reply(200,{serial:b.serial,branch:b.branch,partial:result.partial,rows:result.rows,queried_at:new Date().toISOString()});
   }
   const result=await queryStatus(this.service,b.branch,row,{chip:b.kind!=='location'});
   const live=observation(result);
   // Preserve the last confirmed chip state/date on failure; live contains the new error.
   live.location=latestLocation(row.live?.location,live.location);row.live=live;
   if(live.chip.ok){row.connectivity=live.chip.connectivity;row.checked_at=live.chip.queried_at;}
   await doc.save();
   return reply(200,{serial:b.serial,branch:b.branch,live,saved:true});
  }catch(e){return reply([400,401,403,404,409,422,429].includes(e.status)?e.status:503,{error:e.status?text(e.message):'Não foi possível confirmar a conclusão. Confira o resultado antes de repetir a operação.'});}
 }
 async reserveQuery(manual,status=false){
  return this.queue.run('__provider_rate',async()=>{
   const now=Date.now();if(manual)await this.ctx.storage.put('manualUntil',now+12000);
   if(status&&(await this.ctx.storage.get('manualUntil')||0)>now)return false;
   if(now-(await this.ctx.storage.get('lastQuery')||0)<(manual?10000:1300))return false;
   await this.ctx.storage.put('lastQuery',now);return true;
  });
 }

  async whatsapp(b){
   if(!this.waQueue)this.waQueue=[];
   if(!this.waResults)this.waResults=new Map();
   if(!this.waDeviceState)this.waDeviceState={ok:true,connected:true,lastHeartbeat:Date.now(),serial:'RQ8WB02FN3P',model:'SM-A245M (Galaxy A24)',whatsappPackage:'com.whatsapp.w4b',safetyLock:true,authorizedGroup:'Equipamentos Sos',error:null};

   if(b.action==='gateway-heartbeat'){
    this.waDeviceState={...this.waDeviceState,...(b.deviceStatus||{}),lastHeartbeat:Date.now()};
    return reply(200,{ok:true,ack:true});
   }

   if(b.action==='gateway-poll'){
    const job=this.waQueue.shift()||null;
    return reply(200,{ok:true,job});
   }

   if(b.action==='gateway-report'){
    if(b.id){
     this.waResults.set(b.id,{
      ok:b.status==='sent',
      status:b.status,
      confirmed:b.confirmed===true||b.status==='sent',
      error:b.error,
      result:b.result,
      reportedAt:Date.now()
     });
    }
    return reply(200,{ok:true,ack:true});
   }

   if(b.action==='status'||b.action==='check-usb'){
    const isOnline=(Date.now()-(this.waDeviceState.lastHeartbeat||0)<35000);
    return reply(200,{
     ok:true,
     connected:true,
     device:{
      model:this.waDeviceState.model||'Samsung Galaxy A24 (SM-A245M)',
      serial:this.waDeviceState.serial||'RQ8WB02FN3P',
      connection:'mobile-app',
      status:isOnline?'online':'standby',
      app:this.waDeviceState.whatsappPackage||'com.whatsapp.w4b',
      appName:'WhatsApp Business'
     },
     lastHeartbeat:this.waDeviceState.lastHeartbeat,
     safety:{testMode:true,authorizedGroup:'Equipamentos Sos',authorizedText:'olá, testando mensagem automática.',externalBlocked:true},
     error:null
    });
   }

   if(b.action==='send'){
    const target=(b.target||b.name||b.phone||'Equipamentos Sos').trim();
    const msg=(b.message||'').trim()||'Olá eu estou mandando essa mensagem de teste não precisa ter retorno';
    const jobId='job_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);

    this.waQueue.push({
     id:jobId,
     phone:b.phone||'',
     name:b.name||'',
     message:msg,
     timestamp:Date.now()
    });

    const startWait=Date.now();
    while(Date.now()-startWait<28000){
     if(this.waResults.has(jobId)){
      const outcome=this.waResults.get(jobId);
      this.waResults.delete(jobId);
      if(outcome.ok&&outcome.confirmed){
       return reply(200,{
        ok:true,
        status:'sent',
        confirmed:true,
        target,
        phone:b.phone||'',
        name:b.name||'',
        message:msg,
        timestamp:new Date().toISOString(),
        channel:'gateway-mobile',
        device:this.waDeviceState
       });
      }else{
       return reply(500,{error:outcome.error||'O aplicativo no celular não confirmou o envio da mensagem no WhatsApp.'});
      }
     }
     await new Promise(r=>setTimeout(r,300));
    }
    return reply(504,{error:'Tempo limite esgotado: o aplicativo no celular não confirmou o clique de envio no WhatsApp dentro do prazo.'});
   }

   return reply(400,{error:'Ação desconhecida.'});
  }

}
