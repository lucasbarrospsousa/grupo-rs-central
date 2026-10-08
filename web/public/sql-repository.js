import {PagePreloadCache,preloadPlan} from './page-preload.js';
import {communication} from './stock-live.js';
export class SqlRepository {
  constructor(){this.pageCache=new PagePreloadCache();this.restored=new Set();this.refreshErrors=new Set();this.writeVersion=0;this.preloadVersion=0;this.preloadBranch=null;this.getPending=new Map();this.real=true;this.devices=[];this.vehicles=[];this.warehouse=[];this.reports=[];this.movements=[];this.csrf='';this.user=null;this.loaded=new Set();this.pending=new Map();this.generations=new Map();this.epoch=0;this.warehouseCache=new Map();this.stockSamples=new Map();}
  async request(path,options={}){
    const method=options.method||'GET',eligible=['settings-monitor','query-policy','read-sources','users','logs?q=&user=&module=&outcome=&from=&to=&page=1'].includes(path);
    if(method!=='GET'&&!['activity','ui-event'].includes(path)){this.writeVersion++;this.pageCache.dropSnapshots();this.getPending.clear();}
    if(method!=='GET'||!eligible)return this.networkRequest(path,options);
    if(!options.preload){const cached=this.pageCache.take(path);if(cached!==undefined)return cached;}
    if(this.getPending.has(path))return this.getPending.get(path);
    const pending=this.networkRequest(path,options);this.getPending.set(path,pending);
    try{return await pending;}finally{if(this.getPending.get(path)===pending)this.getPending.delete(path);}
  }
  async networkRequest(path,{method='GET',body,key,signal}={}){
    let response;
    try{response=await fetch('/api/'+path,{method,signal:AbortSignal.any([AbortSignal.timeout(path.startsWith('integrations/')||method==='POST'&&path.startsWith('maintenance?')?120000:25000),...(signal?[signal]:[])]),headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf,...(method!=='GET'?{'Idempotency-Key':key||crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined});}
    catch(error){throw Error(error.name==='TimeoutError'?'O servidor demorou a responder. Tente novamente.':'A conexão com o servidor local foi interrompida. Tente novamente em alguns segundos.');}
    if(response.headers.get('X-Central-Audit')==='unavailable')window.dispatchEvent(new Event('central-audit-unavailable'));
    const data=await response.json();if(response.status===401&&this.user){this.clearPreload();window.dispatchEvent(new Event('central-session-expired'));}if(!response.ok)throw Object.assign(Error(data.error||'Falha na consulta.'),{status:response.status});if(path.startsWith('integrations/stock?')&&data.contacts?.confirmed){const branch=new URLSearchParams(path.split('?')[1]).get('branch');if(branch)this.invalidate(branch,['warehouse']);}return data;
  }
  async session(){this.user=await this.request('session');this.csrf=this.user.csrf;await this.pageCache.bind(this.user);return this.user;}
  async login(username,password,remember){await this.request('login',{method:'POST',body:{username,password,remember}});return this.session();}
  clearPreload(){this.preloadVersion++;this.writeVersion++;this.refreshErrors.clear();this.preloadBranch=null;this.pageCache.clear();this.restored.clear();this.getPending.clear();}
  async logout(){this.clearPreload();this.epoch++;this.activeView=null;this.warehouseCache.clear();this.stockSamples.clear();this.dischargeAnalysisCache?.clear();this.warehouseBranch=null;this.loaded.clear();this.pending.clear();this.devices=[];this.reports=[];this.warehouse=[];this.movements=[];try{await this.request('logout',{method:'POST'});}finally{this.user=null;}}
  groups(route){
    const allowed=modules=>!this.user?.permissions||this.user.permissions.owner||modules.some(m=>this.user.permissions.views.includes(m));
    const result=[];
    if(['overview','stock','tracking','records','route','link','bulk','maintenance'].includes(route)&&allowed(['overview','stock','tracking','records','route','link','bulk','maintenance']))result.push('devices');
    if(route==='maintenance'&&allowed(['maintenance']))result.push('history');
    if(route==='warehouse'&&allowed(['warehouse']))result.push('warehouse');
    return result;
  }
  ready(branch,route){return this.groups(route).every(group=>this.loaded.has(branch+':'+group)&&(group!=='warehouse'||this.warehouseCache.has(branch)));}
  invalidate(branch,groups=['devices','history','warehouse']){
    if(groups.includes('warehouse'))for(const other of this.user?.branches||[]){this.pageCache.drop(other.id,['warehouse']);const key=other.id+':warehouse';this.loaded.delete(key);this.pending.delete(key);this.generations.set(key,(this.generations.get(key)||0)+1);this.warehouseCache.delete(other.id);}
    this.pageCache.drop(branch,groups);
    for(const group of groups){this.refreshErrors.delete(branch+':'+group);this.restored.delete(branch+':'+group);const key=branch+':'+group;this.loaded.delete(key);this.pending.delete(key);this.generations.set(key,(this.generations.get(key)||0)+1);}
  }
  activate(branch,route){
    const key=branch+':'+route;
    this.activeView=key;this.currentBranch=branch;this.currentRoute=route;
    const plan=preloadPlan(this.user,branch);
    for(const group of plan.groups){const cacheKey=branch+':'+group;if(!this.loaded.has(cacheKey)){const data=this.pageCache.snapshot(branch,group);if(data&&Array.isArray(data.rows)){this.applyGroup(branch,group,data);this.loaded.add(cacheKey);this.restored.add(cacheKey);}}}
    if(this.preloadBranch!==branch){this.preloadBranch=branch;void this.preloadSelected(branch);}
    const cached=this.warehouseCache.get(branch);
    this.warehouse=cached?.rows||[];this.movements=cached?.movements||[];this.warehouseBranch=cached?branch:null;
  }
  async preloadSelected(branch,{delay=200}={}){
    const version=++this.preloadVersion,epoch=this.epoch;
    const current=()=>version===this.preloadVersion&&epoch===this.epoch&&!!this.user&&this.currentBranch===branch;
    const plan=preloadPlan(this.user,branch),results=[];
    const tasks=[...plan.groups.map(group=>()=>this.loadGroup(branch,group,{refresh:this.restored.has(branch+':'+group)})),...plan.paths.map(path=>async()=>{const revision=this.writeVersion;const data=await this.request(path,{preload:true});if(current()&&revision===this.writeVersion)this.pageCache.put(path,data);})];
    for(const task of tasks){await new Promise(r=>setTimeout(r,delay));if(!current())break;try{await task();results.push(true);}catch{results.push(false);}}
    return results;
  }
  async load(branch,{route=this.currentRoute||'overview',force=true}={}){
    if(force)this.invalidate(branch);
    await Promise.all(this.groups(route).map(group=>this.loadGroup(branch,group)));
  }
  async loadGroup(branch,group,{refresh=false}={}){
    const key=branch+':'+group;
    if(!refresh&&this.loaded.has(key)&&(group!=='warehouse'||this.warehouseCache.has(branch)))return;
    if(this.pending.has(key))return this.pending.get(key);
    const generation=this.generations.get(key)||0,epoch=this.epoch,revision=this.writeVersion;
    const pending=(async()=>{
      const data=await this.request(group+'?branch='+encodeURIComponent(branch));
      if(epoch!==this.epoch||generation!==(this.generations.get(key)||0))return;
      this.applyGroup(branch,group,data);if(revision===this.writeVersion)this.pageCache.save(branch,group,data);this.refreshErrors.delete(key);
      const wasRestored=this.restored.delete(key);
      if(wasRestored)this.onDataUpdate?.(branch,group);
      this.loaded.add(key);
    })();
    this.pending.set(key,pending);
    try{await pending;}catch(error){if(epoch===this.epoch&&generation===(this.generations.get(key)||0)&&this.restored.has(key)){this.refreshErrors.add(key);this.onDataUpdate?.(branch,group);}throw error;}finally{if(this.pending.get(key)===pending)this.pending.delete(key);}
  }
  applyGroup(branch,group,data){
      if(group==='devices')this.devices=this.devices.filter(d=>d.branch!==branch).concat(data.rows.map(d=>({identification:'',model:'',communication:'Não consultado',connectivity:'Não consultado',installed_at:'',updated_at:'',...d})));
      if(group==='history'){
        const legacy=data.rows.filter(r=>r.source_table==='maintenance').map(r=>({...r.data,id:r.id,branch,legacy:true,entry:r.data.created_at||r.data.opened_at||'',currentSerial:r.data.serial||'',installSerial:r.data.replacement_serial||'',medium:r.data.discovery_method||'',notes:r.data.note||''}));
        this.reports=this.reports.filter(r=>r.branch!==branch).concat((data.visits||[]).map(r=>({...r.data,id:r.id,branch,version:r.version,editable:true})),legacy);
      }
      if(group==='warehouse'){
        const rows=data.rows.map(r=>({...r,received:new Date(r.received_at).toLocaleString('pt-BR')}));
        const movements=data.movements.flatMap(m=>m.items.map(item=>({id:m.id,branch:m.branch||branch,type:item.action||'Envio',serial:item.serial,deviceSerial:item.device_serial||'',phone:item.phone||'',note:m.note||'',detected:item.time_basis==='detection',atISO:item.detected_at||m.created_at,at:new Date(item.detected_at||m.created_at).toLocaleString('pt-BR'),destination:m.destination})));
        const moved=new Set(movements.map(r=>r.serial));
        movements.push(...rows.filter(r=>['Utilizado','Enviado'].includes(r.status)&&!moved.has(r.serial)).map(r=>({id:'legacy-'+r.id,branch:r.branch,type:r.status,serial:r.serial,at:'Data não informada',destination:'Registro importado • destino não informado'})));
        this.warehouseCache.set(branch,{rows,movements});
        if(!this.currentBranch||this.currentBranch===branch){this.warehouse=rows;this.movements=movements;this.warehouseBranch=branch;}
      }

  }
  list(branch){return this.devices.filter(d=>d.branch===branch).map(d=>({...d,...(d.observation?{communication:communication(d.observation.location),connectivity:d.observation.chip?.ok?d.observation.chip.connectivity||'Não informado':'Consulta pendente'}:{})}));}
  async saveDevice(branch,values,current,{key}={}){const result=await this.request('devices'+(current?'/'+current.id:'')+'?branch='+encodeURIComponent(branch),{method:current?'PATCH':'POST',key,body:{data:values,...(current?{version:current.version}:{})}});try{await this.load(branch,{route:'stock'});}catch{return {...result,refreshPending:true};}return result;}
  async deleteDevice(branch,current){await this.request('devices/'+current.id+'?branch='+encodeURIComponent(branch),{method:'DELETE',body:{version:current.version}});await this.load(branch,{route:'stock'});}
  analyze(){throw Error('A baixa depende da integração de consulta da plataforma, ainda em validação.');}
  applyDischarge(){throw Error('A baixa remota ainda está em validação.');}
  async addWarehouse(kind,serial,provider='arya',classification='Estoque'){await this.request('warehouse?branch='+this.currentBranch,{method:'POST',body:{kind,serial,classification,...(kind==='chip'?{provider}:{})}});await this.load(this.currentBranch,{route:'warehouse'});}
  async classifyWarehouse(id,classification){const row=this.warehouse.find(r=>r.id===id);const branch=row.branch;await this.request('warehouse/'+id+'?branch='+branch,{method:'PATCH',body:{classification,version:row.version}});await this.load(this.currentBranch,{route:'warehouse'});}
  async removeWarehouse(id){const row=this.warehouse.find(r=>r.id===id);await this.request('warehouse/'+id+'?branch='+row.branch,{method:'DELETE',body:{version:row.version}});await this.load(this.currentBranch,{route:'warehouse'});}
  async transfer(ids,destination,note){const items=ids.map(id=>{const r=this.warehouse.find(r=>r.id===id);return{id,version:r.version};});await this.request('warehouse-transfer?branch='+this.currentBranch,{method:'POST',body:{items,destination,note}});await this.load(this.currentBranch,{route:'warehouse'});}
  async addBulk(rows,{branch=this.currentBranch,key}={}){const result=await this.request('bulk?branch='+encodeURIComponent(branch),{method:'POST',key,body:{rows}});try{await this.load(branch,{route:'bulk'});}catch{return {...result,refreshPending:true};}return result;}
  async saveReport({branch,id,...data}){const result=await this.request('maintenance?branch='+branch,{method:'POST',body:data,key:id});try{await this.load(branch,{route:'maintenance'});}catch{return {...result,refreshPending:true};}return result;}
  async updateReport(report,values){const result=await this.request('maintenance/'+report.id+'?branch='+report.branch,{method:'PATCH',body:{version:report.version,...values}});try{await this.load(report.branch,{route:'maintenance'});}catch{return {...result,refreshPending:true};}return result;}
  record(){throw Error('Operação ainda não conectada ao servidor.');}
}
