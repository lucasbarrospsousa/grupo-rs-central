import {communication} from './stock-live.js';
export class SqlRepository {
  constructor(){this.real=true;this.devices=[];this.vehicles=[];this.warehouse=[];this.reports=[];this.movements=[];this.csrf='';this.user=null;}
  async request(path,{method='GET',body,key,signal}={}){
    let response;
    try{response=await fetch('/api/'+path,{method,signal:AbortSignal.any([AbortSignal.timeout(path.startsWith('integrations/')?120000:25000),...(signal?[signal]:[])]),headers:{'Content-Type':'application/json','X-CSRF-Token':this.csrf,...(method!=='GET'?{'Idempotency-Key':key||crypto.randomUUID()}:{})},body:body?JSON.stringify(body):undefined});}
    catch(error){throw Error(error.name==='TimeoutError'?'O servidor demorou a responder. Tente novamente.':'A conexão com o servidor local foi interrompida. Tente novamente em alguns segundos.');}
    const data=await response.json();if(response.status===401&&this.user)window.dispatchEvent(new Event('central-session-expired'));if(!response.ok)throw Object.assign(Error(data.error||'Falha na consulta.'),{status:response.status});return data;
  }
  async session(){this.user=await this.request('session');this.csrf=this.user.csrf;return this.user;}
  async login(username,password,remember){await this.request('login',{method:'POST',body:{username,password,remember}});return this.session();}
  async logout(){await this.request('logout',{method:'POST'});this.user=null;this.devices=[];}
  async load(branch){
    const encoded=encodeURIComponent(branch);
    const allowed=modules=>!this.user?.permissions||this.user.permissions.owner||modules.some(m=>this.user.permissions.views.includes(m));
    const [devices,history,warehouse]=await Promise.all([allowed(['overview','stock','tracking','records','route','link','bulk','maintenance'])?this.request('devices?branch='+encoded):{rows:[]},allowed(['maintenance'])?this.request('history?branch='+encoded):{rows:[],visits:[]},allowed(['warehouse'])?this.request('warehouse?branch='+encoded):{rows:[],movements:[]}]);
    this.devices=this.devices.filter(d=>d.branch!==branch).concat(devices.rows.map(d=>({identification:'',model:'',communication:'Não consultado',connectivity:'Não consultado',installed_at:'',updated_at:'',...d})));
    this.reports=history.rows.filter(r=>r.source_table==='maintenance').map(r=>({...r.data,id:r.id,branch,legacy:true,entry:r.data.created_at||r.data.opened_at||'',currentSerial:r.data.serial||'',installSerial:r.data.replacement_serial||'',medium:r.data.discovery_method||'',notes:r.data.note||''}));
    this.reports.unshift(...(history.visits||[]).map(r=>({...r.data,id:r.id,branch,version:r.version,editable:true})));
    this.warehouse=warehouse.rows.map(r=>({...r,received:new Date(r.received_at).toLocaleString('pt-BR')}));
    this.movements=warehouse.movements.flatMap(m=>m.items.map(item=>({id:m.id,branch,type:item.action||'Envio',serial:item.serial,deviceSerial:item.device_serial||'',phone:item.phone||'',note:m.note||'',detected:item.time_basis==='detection',at:new Date(item.detected_at||m.created_at).toLocaleString('pt-BR'),destination:m.destination})));
    const moved=new Set(this.movements.map(r=>r.serial));
    this.movements.push(...this.warehouse.filter(r=>['Utilizado','Enviado'].includes(r.status)&&!moved.has(r.serial)).map(r=>({id:'legacy-'+r.id,branch,type:r.status,serial:r.serial,at:r.received,destination:'Registro importado • destino não informado'})));
    this.currentBranch=branch;
  }
  list(branch){return this.devices.filter(d=>d.branch===branch).map(d=>({...d,...(d.observation?{communication:communication(d.observation.location),connectivity:d.observation.chip?.ok?d.observation.chip.connectivity||'Não informado':'Consulta pendente'}:{})}));}
  async saveDevice(branch,values,current){await this.request('devices'+(current?'/'+current.id:'')+'?branch='+encodeURIComponent(branch),{method:current?'PATCH':'POST',body:{data:values,...(current?{version:current.version}:{})}});await this.load(branch);}
  async deleteDevice(branch,current){await this.request('devices/'+current.id+'?branch='+encodeURIComponent(branch),{method:'DELETE',body:{version:current.version}});await this.load(branch);}
  analyze(){throw Error('A baixa depende da integração de consulta da plataforma, ainda em validação.');}
  applyDischarge(){throw Error('A baixa remota ainda está em validação.');}
  async addWarehouse(kind,serial){await this.request('warehouse?branch='+this.currentBranch,{method:'POST',body:{kind,serial}});await this.load(this.currentBranch);}
  async removeWarehouse(id){const row=this.warehouse.find(r=>r.id===id);await this.request('warehouse/'+id+'?branch='+this.currentBranch,{method:'DELETE',body:{version:row.version}});await this.load(this.currentBranch);}
  async transfer(ids,destination,note){const items=ids.map(id=>{const r=this.warehouse.find(r=>r.id===id);return{id,version:r.version};});await this.request('warehouse-transfer?branch='+this.currentBranch,{method:'POST',body:{items,destination,note}});await this.load(this.currentBranch);}
  async addBulk(rows){const result=await this.request('bulk?branch='+this.currentBranch,{method:'POST',body:{rows}});await this.load(this.currentBranch);return result;}
  async saveReport({branch,id,...data}){await this.request('maintenance?branch='+branch,{method:'POST',body:data,key:id});await this.load(branch);}
  async updateReport(report,values){await this.request('maintenance/'+report.id+'?branch='+report.branch,{method:'PATCH',body:{version:report.version,...values}});await this.load(report.branch);}
  record(){throw Error('Operação ainda não conectada ao servidor.');}
}
