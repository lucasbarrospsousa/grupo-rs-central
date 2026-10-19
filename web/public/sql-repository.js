import {loadWarehouseCosts} from './warehouse-cost-cache.js';
import {canonicalView,initialReadPlan,warehousePreloadPaths} from './startup-preload.js';
import {mergeIncremental} from './incremental-cache.js';
import {applyMutationReceipt} from './mutation-receipt.js';
import {PagePreloadCache,preloadPlan} from './page-preload.js';
import {communication} from './stock-live.js';
export class SqlRepository {
  constructor(){this.viewFlights=new Map();this.viewFresh=new Map();this.stockFlights=new Map();this.stockFresh=new Map();this.views=new Map();this.stockPages=new Map();this.summaries=new Map();this.incremental=new Map();this.countSnapshots=new Map();this.stale=new Set();this.pageCache=new PagePreloadCache();this.restored=new Set();this.refreshErrors=new Set();this.writeVersion=0;this.preloadVersion=0;this.preloadBranch=null;this.getPending=new Map();this.real=true;this.devices=[];this.vehicles=[];this.warehouse=[];this.reports=[];this.movements=[];this.csrf='';this.user=null;this.loaded=new Set();this.pending=new Map();this.generations=new Map();this.epoch=0;this.warehouseCache=new Map();this.stockSamples=new Map();}
  async request(path,options={}){
    const method=options.method||'GET',eligible=['settings-monitor','query-policy','read-sources','users','logs?q=&user=&module=&outcome=&from=&to=&page=1'].includes(path);
    if(method!=='GET'&&!['activity','ui-event'].includes(path)){this.viewFresh.clear();this.viewFlights.clear();this.stockFresh.clear();this.stockFlights.clear();this.views.clear();this.writeVersion++;this.pageCache.dropSnapshots();this.getPending.clear();}
    if(method==='GET'&&path.startsWith('integrations/inventory-counts?')){
      const epoch=this.epoch,revision=this.writeVersion,previous=this.countSnapshots.get(path),data=await this.networkRequest(path+(previous?.cursor?'&since='+previous.cursor:''),options);
      const result=data.unchanged&&previous?{...previous,cursor:data.cursor}:data;
      if(data.allowed)for(const key of ['stock','warehouse','chips'])if(!data.allowed.includes(key))delete result[key];
      if(epoch!==this.epoch||revision!==this.writeVersion)throw Error('Contagem mudou durante a consulta.');
      this.countSnapshots.set(path,result);return result;
    }
    if(method==='GET'&&path.startsWith('integrations/stock-page?')&&new URLSearchParams(path.split('?')[1]).get('kind')==='locations'){
      const branch=new URLSearchParams(path.split('?')[1]).get('branch'),key=branch+':devices',snapshot=this.incremental.get(key),epoch=this.epoch,revision=this.writeVersion,generation=this.generations.get(key)||0;
      const paged=this.currentRoute==='stock'&&this.currentStockQuery?.branch===branch?this.currentStockQuery:null,oldPage=paged&&this.stockPages.get(paged.key);const data=await this.networkRequest(path+(paged?'&pageQuery='+encodeURIComponent(paged.key)+(oldPage?.cursor?'&since='+oldPage.cursor:''):(snapshot?.cursor?'&since='+snapshot.cursor:'')),options);
      if(data.savedPage&&paged&&epoch===this.epoch&&revision===this.writeVersion)this.adoptStockPage(branch,paged.key,data.savedPage);
      if(data.savedChanges&&epoch===this.epoch&&revision===this.writeVersion&&generation===(this.generations.get(key)||0))this.acceptIncremental(branch,'devices',data.savedChanges,true);
      return data;
    }
    if(method!=='GET'||!eligible)return this.networkRequest(path,options);
    if(!options.preload){const cached=this.pageCache.take(path);if(cached!==undefined)return cached;}
    if(this.getPending.has(path))return this.getPending.get(path);
    const pending=this.networkRequest(path,options);this.getPending.set(path,pending);
    try{return await pending;}finally{if(this.getPending.get(path)===pending)this.getPending.delete(path);}
  }
  async networkRequest(path,{method='GET',body,key,signal}={}){
    let response;const requestEpoch=this.epoch;
    try{response=await fetch('/api/'+path,{method,signal:AbortSignal.any([AbortSignal.timeout(path.startsWith('warehouse-pending')||path.startsWith('warehouse-activation')||method==='POST'&&path.startsWith('warehouse-costs?')||path.startsWith('integrations/')||method==='POST'&&path.startsWith('maintenance?')?120000:25000),...(signal?[signal]:[])]),headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf,...(method!=='GET'?{'Idempotency-Key':key||crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined});}
    catch(error){throw Error(error.name==='TimeoutError'?'O servidor demorou a responder. Tente novamente.':'A conexão com o servidor local foi interrompida. Tente novamente em alguns segundos.');}
    if(response.headers.get('X-Central-Audit')==='unavailable')window.dispatchEvent(new Event('central-audit-unavailable'));
    const data=await response.json();if(response.status===401){this.clearPreload();window.dispatchEvent(new Event('central-session-expired'));}if(!response.ok)throw Object.assign(Error(data.error||'Falha na consulta.'),{status:response.status});if(method!=='GET'&&/^(devices|warehouse|warehouse-transfer|warehouse-pending|warehouse-activation|warehouse-activation-send|bulk|maintenance|install)(?:[/?]|$)/.test(path)&&data.ok!==true)throw Error(data.error||data.message||'Gravação não confirmada.');if(path.startsWith('integrations/stock?')&&data.contacts?.confirmed){const branch=new URLSearchParams(path.split('?')[1]).get('branch');if(branch)this.invalidate(branch,['warehouse']);}if(method!=='GET'&&data.ok===true&&requestEpoch===this.epoch){if(data.changes){this.writeVersion++;applyMutationReceipt(this,data.changes);}else data.refreshPending=true;}return data;
  }
  async session(){this.user=await this.request('session');this.csrf=this.user.csrf;await this.pageCache.bind(this.user);return this.user;}
  async login(username,password,remember){await this.request('login',{method:'POST',body:{username,password,remember}});return this.session();}
  clearPreload(){this.viewFresh.clear();this.viewFlights.clear();this.stockFresh.clear();this.stockFlights.clear();this.views.clear();this.stockPages.clear();this.summaries.clear();this.currentStockQuery=null;this.incremental.clear();this.countSnapshots.clear();this.stale.clear();this.preloadVersion++;this.writeVersion++;this.refreshErrors.clear();this.preloadBranch=null;this.pageCache.clear();this.restored.clear();this.getPending.clear();}
  async logout(){this.clearPreload();this.receiptVersions?.clear();this.epoch++;this.activeView=null;this.warehouseCache.clear();this.stockSamples.clear();this.dischargeAnalysisCache?.clear();this.warehouseBranch=null;this.loaded.clear();this.pending.clear();this.devices=[];this.reports=[];this.warehouse=[];this.movements=[];await this.pageCache.flush();try{await this.request('logout',{method:'POST'});}finally{this.user=null;}}
  groups(route){return route==='overview'?['summary']:[];}
  ready(branch,route){return this.groups(route).every(group=>this.loaded.has(branch+':'+group)&&(group!=='warehouse'||this.warehouseCache.has(branch)));}
  invalidate(branch,groups=['devices','history','warehouse','summary']){
    this.viewFresh.clear();this.viewFlights.clear();this.stockFresh.clear();this.stockFlights.clear();this.viewGeneration=(this.viewGeneration||0)+1;
    if(groups.includes('devices'))this.stockPages.clear();
    if(groups.includes('warehouse'))for(const other of this.user?.branches||[]){this.pageCache.drop(other.id,['warehouse']);const key=other.id+':warehouse';this.stale.add(key);this.pending.delete(key);this.generations.set(key,(this.generations.get(key)||0)+1);}
    this.pageCache.drop(branch,groups);
    for(const group of groups){this.refreshErrors.delete(branch+':'+group);this.restored.delete(branch+':'+group);const key=branch+':'+group;this.stale.add(key);this.pending.delete(key);this.generations.set(key,(this.generations.get(key)||0)+1);}
  }
  activate(branch,route){
    const key=branch+':'+route;
    this.activeView=key;this.currentBranch=branch;this.currentRoute=route;
    const plan={groups:this.groups(route)};
    for(const group of plan.groups){const cacheKey=branch+':'+group;if(!this.loaded.has(cacheKey)){const data=this.pageCache.snapshot(branch,group);if(data&&(group==='summary'||Array.isArray(data.rows))){this.applyGroup(branch,group,data);if(data.cursor)this.incremental.set(cacheKey,data);this.loaded.add(cacheKey);this.restored.add(cacheKey);}}}
    if(this.preloadBranch!==branch){this.preloadBranch=branch;void this.preloadSelected(branch);}else if(route==='warehouse'&&this.preloadRoute!==route&&!this.preloadRunning){void this.preloadSelected(branch,{warehouseOnly:true});}this.preloadRoute=route;
    const cached=this.warehouseCache.get(branch);
    this.warehouse=cached?.rows||[];this.movements=cached?.movements||[];this.warehouseBranch=cached?branch:null;
  }
  async preloadSelected(branch,{delay=80,warehouseOnly=false}={}){
    const version=++this.preloadVersion,epoch=this.epoch,revision=this.writeVersion;this.preloadRunning=version;
    const current=()=>version===this.preloadVersion&&epoch===this.epoch&&revision===this.writeVersion&&!!this.user&&this.currentBranch===branch;
    const plan=initialReadPlan(this.user,branch),results=[];
    const tasks=(warehouseOnly?warehousePreloadPaths(this.user,branch):plan.views).map(path=>()=>this.readView(branch,path));
    if(this.user?.permissions?.owner&&plan.views.some(p=>p.startsWith('warehouse?')))tasks.push(()=>loadWarehouseCosts(this));
    if(!warehouseOnly){
      if(plan.summary)tasks.unshift(()=>this.loadGroup(branch,'summary',{refresh:this.restored.has(branch+':summary')}));
      if(plan.stock)tasks.push(()=>this.readStockPage(branch,{}, {preload:true}));
      tasks.push(...plan.paths.map(path=>async()=>{const data=await this.request(path,{preload:true});if(current())this.pageCache.put(path,data);}));
    }
    // Small bounded queue; navigation shares pending reads and fresh results.
    let next=0;
    const worker=async()=>{while(next<tasks.length){await new Promise(r=>setTimeout(r,delay));if(!current())break;const task=tasks[next++];if(!task)break;try{await task();results.push(true);}catch{results.push(false);}}};
    try{await Promise.all([worker(),worker()]);return results;}finally{if(this.preloadRunning===version)this.preloadRunning=null;}
  }
  async load(branch,{route=this.currentRoute||'overview',force=true}={}){
    if(force)this.invalidate(branch);
    if(route==='stock'){this.stockPages.clear();return;}
    await Promise.all(this.groups(route).map(group=>this.loadGroup(branch,group)));
  }
  async loadGroup(branch,group,{refresh=false}={}){
    const key=branch+':'+group;
    if(!refresh&&!this.stale.has(key)&&this.loaded.has(key)&&(group!=='warehouse'||this.warehouseCache.has(branch)))return;
    if(this.pending.has(key))return this.pending.get(key);
    const hadData=this.loaded.has(key),generation=this.generations.get(key)||0,epoch=this.epoch,revision=this.writeVersion;
    const pending=(async()=>{
      const snapshot=this.incremental.get(key),data=await this.request((group==='summary'?'devices?scope=summary&branch=':group+'?branch=')+encodeURIComponent(branch)+(snapshot?.cursor?'&since='+snapshot.cursor:''));
      if(epoch!==this.epoch||generation!==(this.generations.get(key)||0))return;
      if(revision!==this.writeVersion)return;
      this.acceptIncremental(branch,group,data);this.refreshErrors.delete(key);
      const wasRestored=this.restored.delete(key);this.stale.delete(key);
      this.loaded.add(key);
      if(wasRestored||(hadData&&!data.unchanged))this.onDataUpdate?.(branch,group);
    })();
    this.pending.set(key,pending);
    try{await pending;}catch(error){if(epoch===this.epoch&&generation===(this.generations.get(key)||0)&&(hadData||this.restored.has(key))){this.refreshErrors.add(key);this.onDataUpdate?.(branch,group);}throw error;}finally{if(this.pending.get(key)===pending)this.pending.delete(key);}
  }
  acceptIncremental(branch,group,data,notify=false){
    const key=branch+':'+group,previous=this.incremental.get(key);
    if(data.delta&&(!previous||BigInt(data.cursor)<BigInt(previous.cursor)))return;
    if(group==='summary'){const merged=data.unchanged?{...this.summaries.get(branch),cursor:data.cursor}:data;this.summaries.set(branch,merged);this.incremental.set(key,merged);this.pageCache.save(branch,group,merged);return;}
    const merged=mergeIncremental(previous,data);
    if(!data.unchanged){if(group==='devices')merged.rows.sort((a,b)=>String(a.serial).localeCompare(String(b.serial)));if(group==='warehouse'){merged.rows.sort((a,b)=>(Date.parse(b.received_at)||0)-(Date.parse(a.received_at)||0));merged.movements.sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0));}}
    if(merged.cursor)this.incremental.set(key,merged);
    if(!data.unchanged)this.applyGroup(branch,group,merged);
    this.pageCache.save(branch,group,merged);
    if(notify&&!data.unchanged&&data.cursor!==previous?.cursor)this.onDataUpdate?.(branch,group);
  }
  applyGroup(branch,group,data){
      if(group==='summary')this.summaries.set(branch,data);
      if(group==='devices')this.devices=this.devices.filter(d=>d.branch!==branch).concat(data.rows.map(d=>({identification:'',model:'',communication:'Não consultado',connectivity:'Não consultado',installed_at:'',updated_at:'',...d})));
      if(group==='history'){
        const legacy=data.rows.filter(r=>r.source_table==='maintenance').map(r=>({...r.data,id:r.id,branch,legacy:true,entry:r.data.created_at||r.data.opened_at||'',currentSerial:r.data.serial||'',installSerial:r.data.replacement_serial||'',medium:r.data.discovery_method||'',notes:r.data.note||''}));
        this.reports=this.reports.filter(r=>r.branch!==branch).concat((data.visits||[]).map(r=>({...r.data,id:r.id,branch,version:r.version,editable:true})),legacy);
      }
      if(group==='warehouse'){
        const rows=data.rows.map(r=>({...r,received:new Date(r.received_at).toLocaleString('pt-BR')}));
        const movements=data.movements.flatMap(m=>m.items.map(item=>({id:m.id,branch:m.branch||branch,type:item.action||'Envio',kind:item.kind,serial:item.serial,deviceSerial:item.device_serial||'',phone:item.phone||'',note:m.note||'',detected:item.time_basis==='detection',atISO:item.detected_at||m.created_at,at:new Date(item.detected_at||m.created_at).toLocaleString('pt-BR'),destination:m.destination})));
        const moved=new Set(movements.map(r=>r.serial));
        movements.push(...rows.filter(r=>['Utilizado','Enviado'].includes(r.status)&&!moved.has(r.serial)).map(r=>({id:'legacy-'+r.id,branch:r.branch,type:r.status,serial:r.serial,at:'Data não informada',destination:'Registro importado • destino não informado'})));
        this.warehouseCache.set(branch,{rows,movements});
        if(!this.currentBranch||this.currentBranch===branch){this.warehouse=rows;this.movements=movements;this.warehouseBranch=branch;}
      }

  }
  peekView(branch,path){path=canonicalView(path);const result=this.views.get(path)||this.pageCache.snapshot(branch,'view:'+path);if(result){const target=path.startsWith('devices?')?this.devices:path.startsWith('warehouse?')&&new URLSearchParams(path.split('?')[1]).get('view')!=='movements'?this.warehouse:null;if(target)for(const row of result.rows||[]){const at=target.findIndex(r=>r.id===row.id&&r.branch===row.branch);if(at<0)target.push(row);else target[at]=row;}}return result;}
  async readView(branch,path,{force=false}={}){
    path=canonicalView(path);const fresh=this.viewFresh.get(path);
    if(!force&&fresh&&fresh.revision===this.writeVersion&&Date.now()-fresh.at<(path.startsWith('integrations/operations?')?12000:30000))return this.peekView(branch,path);
    if(this.viewFlights.has(path))return this.viewFlights.get(path);
    const generation=this.viewGeneration||0,epoch=this.epoch,revision=this.writeVersion;
    const flight=this.fetchView(branch,path,generation).then(result=>{if(epoch===this.epoch&&revision===this.writeVersion&&generation===(this.viewGeneration||0))this.viewFresh.set(path,{revision,at:Date.now()});return result;});
    this.viewFlights.set(path,flight);try{return await flight;}finally{if(this.viewFlights.get(path)===flight)this.viewFlights.delete(path);}
  }
  async fetchView(branch,path,generation){const old=this.peekView(branch,path),epoch=this.epoch,revision=this.writeVersion,data=await this.request(path+(old?.cursor?'&since='+encodeURIComponent(old.cursor):''));if(epoch!==this.epoch||revision!==this.writeVersion||generation!==(this.viewGeneration||0))throw Error('Dados alterados durante a consulta.');const result=data.unchanged?{...old,cursor:data.cursor}:data;this.views.set(path,result);this.pageCache.save(branch,'view:'+path,result);if(path.startsWith('devices?'))for(const row of result.rows||[]){const at=this.devices.findIndex(r=>r.id===row.id&&r.branch===branch);if(at<0)this.devices.push(row);else this.devices[at]=row;}if(path.startsWith('warehouse?')&&new URLSearchParams(path.split('?')[1]).get('view')!=='movements')for(const row of result.rows||[]){const at=this.warehouse.findIndex(r=>r.id===row.id);if(at<0)this.warehouse.push(row);else this.warehouse[at]=row;}return result;}
  stockQuery(branch,model){return new URLSearchParams({branch,scope:'page',query:model.query||'',status:model.status||'Todos',start:model.start||'',end:model.end||'',sort:model.sort||'default',direction:model.direction??-1,page:model.page||1}).toString();}
  peekStockPage(branch,model){const key=this.stockQuery(branch,model),cached=this.stockPages.get(key);if(cached)return cached;const saved=this.pageCache.snapshot(branch,'page:'+key);return saved?this.adoptStockPage(branch,key,saved):null;}
  adoptStockPage(branch,key,data){const old=this.stockPages.get(key)||this.pageCache.snapshot(branch,'page:'+key);if(old?.cursor&&data.cursor&&BigInt(data.cursor)<BigInt(old.cursor))return old;const result=data.unchanged?{...old,cursor:data.cursor}:data;if(!result?.rows)throw Error('Página incompleta.');this.stockPages.set(key,result);this.pageCache.save(branch,'page:'+key,result);for(const row of result.rows){const at=this.devices.findIndex(r=>r.id===row.id&&r.branch===branch);if(at>=0)this.devices[at]={...this.devices[at],...row};else this.devices.push(row);}return result;}
  async readStockPage(branch,model,options={}){
    if(options.exportAll)return this.fetchStockPage(branch,model,options);
    const key=this.stockQuery(branch,model),fresh=this.stockFresh.get(key);
    if(!options.preload)this.currentStockQuery={branch,key};
    if(fresh&&fresh.revision===this.writeVersion&&Date.now()-fresh.at<30000)return this.peekStockPage(branch,model);
    if(this.stockFlights.has(key))return this.stockFlights.get(key);
    const revision=this.writeVersion,epoch=this.epoch,generation=this.viewGeneration||0,flight=this.fetchStockPage(branch,model,{...options,generation}).then(result=>{if(epoch===this.epoch&&revision===this.writeVersion&&generation===(this.viewGeneration||0))this.stockFresh.set(key,{revision,at:Date.now()});return result;});
    this.stockFlights.set(key,flight);try{return await flight;}finally{if(this.stockFlights.get(key)===flight)this.stockFlights.delete(key);}
  }
  async fetchStockPage(branch,model,{exportAll=false,preload=false,generation=this.viewGeneration||0}={}){const key=this.stockQuery(branch,model),old=this.peekStockPage(branch,model),epoch=this.epoch,revision=this.writeVersion;if(!preload)this.currentStockQuery={branch,key};const data=await this.request('devices?'+key+(exportAll?'&export=1':old?.cursor?'&since='+old.cursor:''));if(epoch!==this.epoch||revision!==this.writeVersion||generation!==(this.viewGeneration||0))throw Error('Dados alterados durante a consulta.');return exportAll?data:this.adoptStockPage(branch,key,data);}
  list(branch){return this.devices.filter(d=>d.branch===branch).map(d=>({...d,...(d.observation?{communication:communication(d.observation.location),connectivity:d.observation.chip?.ok?d.observation.chip.connectivity||'Não informado':'Consulta pendente'}:{})}));}
  mutationResult(result){return result.changes?result:{...result,refreshPending:true};}
  async saveDevice(branch,values,current,{key}={}){const result=await this.request('devices'+(current?'/'+current.id:'')+'?branch='+encodeURIComponent(branch),{method:current?'PATCH':'POST',key,body:{data:values,...(current?{version:current.version}:{})}});if(!result.changes&&Object.hasOwn(values,'iccid'))this.invalidate(branch,['warehouse']);return this.mutationResult(result);}
  async deleteDevice(branch,current){await this.request('devices/'+current.id+'?branch='+encodeURIComponent(branch),{method:'DELETE',body:{version:current.version}});}
  analyze(){throw Error('A baixa depende da integração de consulta da plataforma, ainda em validação.');}
  applyDischarge(){throw Error('A baixa remota ainda está em validação.');}
  async addWarehouse(kind,serial,provider='arya',classification='Estoque'){await this.request('warehouse?branch='+this.currentBranch,{method:'POST',body:{kind,serial,classification,...(kind==='chip'?{provider}:{})}});}
  async classifyWarehouse(id,classification){const row=this.warehouse.find(r=>r.id===id);const branch=row.branch;await this.request('warehouse/'+id+'?branch='+branch,{method:'PATCH',body:{classification,version:row.version}});}
  async removeWarehouse(id){const row=this.warehouse.find(r=>r.id===id);await this.request('warehouse/'+id+'?branch='+row.branch,{method:'DELETE',body:{version:row.version}});}
  async transfer(ids,destination,note){const items=ids.map(id=>{const r=this.warehouse.find(r=>r.id===id);return{id,version:r.version};});await this.request('warehouse-transfer?branch='+this.currentBranch,{method:'POST',body:{items,destination,note}});}
  async addBulk(rows,{branch=this.currentBranch,key}={}){const result=await this.request('bulk?branch='+encodeURIComponent(branch),{method:'POST',key,body:{rows}});return this.mutationResult(result);}
  async saveReport({branch,id,...data}){const result=await this.request('maintenance?branch='+branch,{method:'POST',body:data,key:id});return this.mutationResult(result);}
  async updateReport(report,values){const result=await this.request('maintenance/'+report.id+'?branch='+report.branch,{method:'PATCH',body:{version:report.version,...values}});return this.mutationResult(result);}
  record(){throw Error('Operação ainda não conectada ao servidor.');}
}
