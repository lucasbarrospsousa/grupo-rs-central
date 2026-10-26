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
import {trackingDocument} from './drive.mjs';
const reply=(status,data)=>Response.json(data,{status});
const text=v=>typeof v==='string'?v.slice(0,300):typeof v==='number'?String(v):'';
const project=(row,keys)=>Object.fromEntries(keys.map(k=>[k,text(row?.[k])]));
export function observation(result){
 const location=result.location?.ok?{ok:true,...project(result.location,['serial','plate','lat','lng','speed','ignition','battery','internal_battery','internal_battery_voltage','updated_at','gps_at','gps_signal','queried_at'])}:{ok:false,message:text(result.location?.message)||'Comunicação indisponível.'};
 const chip=result.chip?.ok?{ok:true,...project(result.chip,['provider','status','connectivity','operator','queried_at'])}:{ok:false,message:text(result.chip?.message)||'Chip não confirmado.'};
 return {queried_at:result.queried_at,location,chip};
}
export class Operations {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.queue=new WriteQueue();this.service=guardQueries(new Integrations({secrets:()=>JSON.parse(env.INTEGRATIONS_CONFIG||'null')||{}}),ctx.storage);this.jobs=new BackgroundJobs({storage:ctx.storage,users:async()=>decryptUsers(await driveUsers(JSON.parse(env.DRIVE_CONFIG)),env.AUTH_DATA_KEY),run:j=>this.runJob(j)});}
 async alarm(){return this.queue.run('__jobs',()=>this.jobs.alarm());}
 async runJob(j){return this.queue.run('__writer',async()=>{
  await this.recoverConfig();
  if(j.kind==='status'){const serial=j.serials[j.cursor];if(!serial)return {finished:true};const result=await this.execute(new Request('https://operations.internal/query'),{kind:'status',branch:j.branch,serial});if(!result.ok)throw Error('Query pending');return {finished:j.cursor+1>=j.serials.length};}
  const doc=await trackingDocument(JSON.parse(this.env.DRIVE_CONFIG),j.branch),items=(doc.data.warehouse?.rows||[]).filter(r=>!r.deleted_at&&r.kind==='chip'&&r.status==='Disponível'&&['arya','link'].includes(r.chip_provider));
  const row=items[j.cursor];if(!row)return {finished:true};
  if(Date.now()-Date.parse(row.checked_at||'')>=3600000||!Number.isFinite(Date.parse(row.checked_at||''))){if(!await this.reserveQuery(false,true))throw Error('Rate limited');const chip=await this.service.carrier(row.chip_provider,row.serial);if(!chip.ok||chip.iccid!==row.serial)throw Error('Unconfirmed chip');Object.assign(row,{chip_operator:chip.operator,chip_phone:chip.phone,chip_status:chip.status,checked_at:chip.queried_at,version:(row.version||1)+1});await doc.save();}
  return {finished:j.cursor+1>=items.length};
 });}
 async fetch(request){
  let b;try{b=await request.json();}catch{return reply(400,{error:'JSON inválido.'});}
  let imported;try{imported=typeof b.importBody==='string'?JSON.parse(b.importBody):null;}catch{return reply(400,{error:'Importação inválida.'});}
  if(new URL(request.url).pathname==='/barrier'){try{await this.queue.run('__writer',()=>this.recoverConfig());return reply(200,{ok:true});}catch{return reply(503,{error:'Recuperação pendente.'});}}
  const branch=b.input?.branch||b.branch||imported?.branch;
  if(!Object.hasOwn(ORIGINS,branch))return reply(400,{error:'Filial inválida.'});
  if(new URL(request.url).pathname==='/jobs'){try{return reply(200,await this.queue.run('__jobs',()=>this.jobs.configure(b.input,b.user)));}catch(e){return reply(e.status||503,{error:e.message});}}
  try{return await this.queue.run('__writer',async()=>{await this.recoverConfig();return this.execute(request,b);});}catch(e){return reply(e.status||503,{error:e.status?e.message:'Operação indisponível.'});}
 }
 journalOptions(){return {storage:this.ctx.storage,key:this.env.AUTH_DATA_KEY,document:branch=>trackingDocument(JSON.parse(this.env.DRIVE_CONFIG),branch)};}
 async recoverConfig(){return recoverConfig(this.journalOptions());}
 async configurator(p){
  const credential=JSON.parse(this.env.CONFIGURATOR_ACCESS||'null');
  const users=await decryptUsers(await driveUsers(JSON.parse(this.env.DRIVE_CONFIG)),this.env.AUTH_DATA_KEY);
  const user=users.users.find(u=>u.username===credential?.username&&u.active);
  const documents={};for(const branch of Object.keys(ORIGINS))documents[branch]=await this.journalOptions().document(branch);
  const result=await prepareConfig({p,user,documents,service:this.service});
  return result.response||commitConfig(result.plan,this.journalOptions());
 }
 async execute(request,b){
  try{
   if(new URL(request.url).pathname==='/configurator')return reply(200,await this.configurator(b.input));
   if(new URL(request.url).pathname==='/warehouse')return reply(200,await warehouse({input:b.input,user:b.user,config:JSON.parse(this.env.DRIVE_CONFIG||'null'),service:this.service}));
   if(b.kind==='maintenance-import'&&typeof b.importBody!=='string')return reply(400,{error:'Missing import envelope'});
   if(new URL(request.url).pathname==='/maintenance-import'||b.kind==='maintenance-import'){if(!verifyImport(b.importBody,b.importSignature,this.env.AUTH_DATA_KEY,this.env.MAINTENANCE_IMPORT_UNTIL))return reply(403,{error:'Importação desabilitada.'});try{return reply(200,await (JSON.parse(b.importBody).action?.startsWith('migration')?importMigration:importMaintenance)(JSON.parse(b.importBody),JSON.parse(this.env.DRIVE_CONFIG||'null')));}catch(e){return reply(503,{error:'Não foi possível concluir a importação.'});}}
   if(new URL(request.url).pathname==='/maintenance')return reply(200,await maintenance({input:b.input,user:b.user,config:JSON.parse(this.env.DRIVE_CONFIG||'null')}));
   if(new URL(request.url).pathname==='/galaxy'&&b.android)return reply(200,await galaxyAndroid({input:b.input,token:b.token,document:branch=>trackingDocument(JSON.parse(this.env.DRIVE_CONFIG),branch),users:async()=>decryptUsers(await driveUsers(JSON.parse(this.env.DRIVE_CONFIG)),this.env.AUTH_DATA_KEY)}));
   if(new URL(request.url).pathname==='/galaxy')return reply(200,await galaxy({input:b.input,token:b.token,config:JSON.parse(this.env.DRIVE_CONFIG||'null'),key:this.env.AUTH_DATA_KEY}));
   if(new URL(request.url).pathname==='/inventory'){
    const remote=['analyze','lookup','link-preview','link-confirm','link-check','refresh-equipment','sms-send','swap-preview','swap-execute','swap-check'].includes(b.input?.action);
    if(remote){const allowed=await this.reserveQuery(true);if(!allowed)return reply(429,{error:'Aguarde dez segundos entre consultas.'});}
    return reply(200,await inventory({input:b.input,user:b.user,config:JSON.parse(this.env.DRIVE_CONFIG||'null'),service:this.service}));
   }
   if(!Object.hasOwn(ORIGINS,b.branch)||!/^\d{6,17}$/.test(b.serial||'')||!['status','location','history'].includes(b.kind))return reply(400,{error:'Consulta inválida.'});
   const doc=await trackingDocument(JSON.parse(this.env.DRIVE_CONFIG||'null'),b.branch);
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
}
