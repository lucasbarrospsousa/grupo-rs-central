import {communication} from './stock-live.js';
export class SqlRepository {
  constructor(){this.real=true;this.devices=[];this.vehicles=[];this.warehouse=[];this.reports=[];this.movements=[];this.csrf='';this.user=null;this.loaded=new Set();this.pending=new Map();this.generations=new Map();this.epoch=0;}
  async request(path,{method='GET',body,key,signal}={}){
    let response;
    try{response=await fetch('/api/'+path,{method,signal:AbortSignal.any([AbortSignal.timeout(path.startsWith('integrations/')?120000:25000),...(signal?[signal]:[])]),headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf,...(method!=='GET'?{'Idempotency-Key':key||crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined});}
    catch(error){throw Error(error.name==='TimeoutError'?'O servidor demorou a responder. Tente novamente.':'A conexão com o servidor local foi interrompida. Tente novamente em alguns segundos.');}
    if(response.headers.get('X-Central-Audit')==='unavailable')window.dispatchEvent(new Event('central-audit-unavailable'));
    const data=await response.json();if(response.status===401&&this.user)window.dispatchEvent(new Event('central-session-expired'));if(!response.ok)throw Object.assign(Error(data.error||'Falha na consulta.'),{status:response.status});if(path.startsWith('integrations/stock?')&&data.contacts?.confirmed){const branch=new URLSearchParams(path.split('?')[1]).get('branch');if(branch)this.invalidate(branch,['warehouse']);}return data;
  }
  async session(){this.user=await this.request('session');this.csrf=this.user.csrf;return this.user;}
  async login(username,password,remember){await this.request('login',{method:'POST',body:{username,password,remember}});return this.session();}
  async logout(){this.epoch++;this.activeView=null;this.loaded.clear();this.pending.clear();this.devices=[];this.reports=[];this.warehouse=[];this.movements=[];try{await this.request('logout',{method:'POST'});}finally{this.user=null;}}
  groups(route){
    const allowed=modules=>!this.user?.permissions||this.user.permissions.owner||modules.some(m=>this.user.permissions.views.includes(m));
    const result=[];
    if(['overview','stock','tracking','records','route','link','bulk','maintenance'].includes(route)&&allowed(['overview','stock','tracking','records','route','link','bulk','maintenance']))result.push('devices');
    if(route==='maintenance'&&allowed(['maintenance']))result.push('history');
    if(route==='warehouse'&&allowed(['warehouse']))result.push('warehouse');
    return result;
  }
  ready(branch,route){return this.groups(route).every(group=>this.loaded.has(branch+':'+group)&&(group!=='warehouse'||this.warehouseBranch===branch));}
  invalidate(branch,groups=['devices','history','warehouse']){
    for(const group of groups){const key=branch+':'+group;this.loaded.delete(key);this.pending.delete(key);this.generations.set(key,(this.generations.get(key)||0)+1);}
  }
  activate(branch,route){
    const key=branch+':'+route;
    if(this.activeView!==key&&['stock','warehouse'].includes(route))this.invalidate(branch,this.groups(route));
    this.activeView=key;this.currentBranch=branch;this.currentRoute=route;
  }
  async load(branch,{route=this.currentRoute||'overview',force=true}={}){
    if(force)this.invalidate(branch);
    await Promise.all(this.groups(route).map(group=>this.loadGroup(branch,group)));
  }
  async loadGroup(branch,group){
    const key=branch+':'+group;
    if(this.loaded.has(key)&&(group!=='warehouse'||this.warehouseBranch===branch))return;
    if(this.pending.has(key))return this.pending.get(key);
    const generation=this.generations.get(key)||0,epoch=this.epoch;
    const pending=(async()=>{
      const data=await this.request(group+'?branch='+encodeURIComponent(branch));
      if(epoch!==this.epoch||generation!==(this.generations.get(key)||0))return;
      if(group==='devices')this.devices=this.devices.filter(d=>d.branch!==branch).concat(data.rows.map(d=>({identification:'',model:'',communication:'Não consultado',connectivity:'Não consultado',installed_at:'',updated_at:'',...d})));
      if(group==='history'){
        const legacy=data.rows.filter(r=>r.source_table==='maintenance').map(r=>({...r.data,id:r.id,branch,legacy:true,entry:r.data.created_at||r.data.opened_at||'',currentSerial:r.data.serial||'',installSerial:r.data.replacement_serial||'',medium:r.data.discovery_method||'',notes:r.data.note||''}));
        this.reports=this.reports.filter(r=>r.branch!==branch).concat((data.visits||[]).map(r=>({...r.data,id:r.id,branch,version:r.version,editable:true})),legacy);
      }
      if(group==='warehouse'){
        if(this.currentBranch&&this.currentBranch!==branch)return;
        this.warehouse=data.rows.map(r=>({...r,received:new Date(r.received_at).toLocaleString('pt-BR')}));
        this.movements=data.movements.flatMap(m=>m.items.map(item=>({id:m.id,branch,type:item.action||'Envio',serial:item.serial,deviceSerial:item.device_serial||'',phone:item.phone||'',note:m.note||'',detected:item.time_basis==='detection',at:new Date(item.detected_at||m.created_at).toLocaleString('pt-BR'),destination:m.destination})));
        const moved=new Set(this.movements.map(r=>r.serial));
        this.movements.push(...this.warehouse.filter(r=>['Utilizado','Enviado'].includes(r.status)&&!moved.has(r.serial)).map(r=>({id:'legacy-'+r.id,branch,type:r.status,serial:r.serial,at:r.received,destination:'Registro importado • destino não informado'})));
        this.warehouseBranch=branch;
      }
      this.loaded.add(key);
    })();
    this.pending.set(key,pending);
    try{await pending;}finally{if(this.pending.get(key)===pending)this.pending.delete(key);}
  }
  list(branch){return this.devices.filter(d=>d.branch===branch).map(d=>({...d,...(d.observation?{communication:communication(d.observation.location),connectivity:d.observation.chip?.ok?d.observation.chip.connectivity||'Não informado':'Consulta pendente'}:{})}));}
  async saveDevice(branch,values,current){await this.request('devices'+(current?'/'+current.id:'')+'?branch='+encodeURIComponent(branch),{method:current?'PATCH':'POST',body:{data:values,...(current?{version:current.version}:{})}});await this.load(branch,{route:'stock'});}
  async deleteDevice(branch,current){await this.request('devices/'+current.id+'?branch='+encodeURIComponent(branch),{method:'DELETE',body:{version:current.version}});await this.load(branch,{route:'stock'});}
  analyze(){throw Error('A baixa depende da integração de consulta da plataforma, ainda em validação.');}
  applyDischarge(){throw Error('A baixa remota ainda está em validação.');}
  async addWarehouse(kind,serial){await this.request('warehouse?branch='+this.currentBranch,{method:'POST',body:{kind,serial}});await this.load(this.currentBranch,{route:'warehouse'});}
  async removeWarehouse(id){const row=this.warehouse.find(r=>r.id===id);await this.request('warehouse/'+id+'?branch='+this.currentBranch,{method:'DELETE',body:{version:row.version}});await this.load(this.currentBranch,{route:'warehouse'});}
  async transfer(ids,destination,note){const items=ids.map(id=>{const r=this.warehouse.find(r=>r.id===id);return{id,version:r.version};});await this.request('warehouse-transfer?branch='+this.currentBranch,{method:'POST',body:{items,destination,note}});await this.load(this.currentBranch,{route:'warehouse'});}
  async addBulk(rows){const result=await this.request('bulk?branch='+this.currentBranch,{method:'POST',body:{rows}});await this.load(this.currentBranch,{route:'bulk'});return result;}
  async saveReport({branch,id,...data}){await this.request('maintenance?branch='+branch,{method:'POST',body:data,key:id});await this.load(branch,{route:'maintenance'});}
  async updateReport(report,values){await this.request('maintenance/'+report.id+'?branch='+report.branch,{method:'PATCH',body:{version:report.version,...values}});await this.load(report.branch,{route:'maintenance'});}
  record(){throw Error('Operação ainda não conectada ao servidor.');}
}
