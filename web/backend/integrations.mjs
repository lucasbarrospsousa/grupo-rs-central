import {withApiBudget} from './api-budget.mjs';
import {measuredRequest} from './query-usage.mjs';
import {request as httpsRequest} from 'node:https';
import {Buffer} from 'node:buffer';
import {integrationSecrets} from './integration-secrets.mjs';
export const ORIGINS={imperatriz:'https://imp.ogrupors.com.br',araguaina:'https://arg.ogrupors.com.br',acailandia:'https://acl.ogrupors.com.br',maraba:'https://mab.ogrupors.com.br'};
const err=(message,status=502)=>Object.assign(Error(message),{status});
export function value(row,keys){for(const k of keys){const key=Object.keys(row||{}).find(x=>x.toLowerCase()===k.toLowerCase());const v=row?.[key];if(v!==null&&v!==undefined&&typeof v!=='object'&&String(v).trim())return String(v).trim();}return '';}
export function rows(data){if(Array.isArray(data))return data.filter(x=>x&&typeof x==='object');if(!data||typeof data!=='object')return [];for(const k of ['data','dados','associados','posicoes','veiculos','vehicles','equipamentos','equipment','localizacao','localizacoes','locations','items','rows','results','records','content','result','inventary','sims']){if(data[k]!==undefined){const found=rows(data[k]);if(found.length)return found;}}return Object.keys(data).some(k=>/^(placa|plate|serial|imei|iccid|numeroEquipamento)$/i.test(k))?[data]:[];}
export function serialOf(row){for(const source of [row,row?.equipamento,row?.equipment,row?.tracker])for(const k of ['serial','numero_serie','numeroSerie','numeroSerieEquipamento','serialEquipamento','imei','numeroEquipamento','numero_equipamento','equipment_number']){const v=value(source,[k]);if(/^\d{6,17}$/.test(v))return v;}return '';}
function tokenOf(data){if(!data||typeof data!=='object')return '';const t=value(data,['token','access_token','accessToken','jwt','id_token']);if(t)return t;for(const v of Object.values(data)){const nested=tokenOf(v);if(nested)return nested;}return '';}
export function plain(html){return String(html).replace(/<[^>]*>/g,'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&(amp|nbsp|lt|gt|quot|apos|atilde|ccedil|iacute);/g,(_,n)=>({amp:'&',nbsp:' ',lt:'<',gt:'>',quot:'"',apos:"'",atilde:'ã',ccedil:'ç',iacute:'í'}[n])).trim();}
export function table(html){const body=html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];if(body===undefined||/<form[^>]*action=["'][^"']*login\.php/i.test(html))throw err('Portal não confirmou a sessão ou o formato da resposta.');return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>({html:m[1],cells:[...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>plain(c[1]))}));}
export function normalize(raw){const row={...raw};for(const k of ['localizacao','location','posicao','position','ultimaPosicao','lastPosition','telemetria','telemetry','dados','coordinates'])if(raw?.[k]&&typeof raw[k]==='object'&&!Array.isArray(raw[k]))for(const [name,v] of Object.entries(raw[k]))if(row[name]===undefined)row[name]=v;return {serial:serialOf(row),plate:value(row,['placa','plate','placaVeiculo']),client:value(row.titular,['nomeCliente'])||(/^[1-9]\d*$/.test(value(row,['codCliente']))?value(row,['nomeCliente']):'')||value(row,['cliente','client','nomeClienteTitular','nomeAssociado']),client_id:value(row.titular,['codCliente'])||value(row,['codCliente']),equipment_id:value(row.equipamento,['codEquipamento']),owner_count:value(row,['qtdClientesVinculadosAtivos']),vehicle_id:value(row,['veiculo_id','vehicle_id','veiculoId','vehicleId','codVeiculo','idVeiculo','id_veiculo','id']),phone:value(row,['telefone','numeroTelefone','phone']),iccid:value(row,['iccid','numeroChip','chip']),apn:value(row,['apn']),lat:value(row,['latitude','lat']),lng:value(row,['longitude','lng','lon']),speed:value(row,['velocidade','speed']),ignition:value(row,['ignicao','ignition','StatusIgnicao','status_ignicao']),battery:value(row,['bateria','battery','voltage']),updated_at:value(row,['ultima_comunicacao','dataServidor','DataServidor','DataComunicacao','data_comunicacao','updated_at']),gps_at:value(row,['dataGPS','gps_at','dataEvento']),gps_signal:value(row,['sinalGps','gps_signal'])};}
// The upstream PHP endpoint looks up Authorization case-sensitively.
// HTTP/1 preserves its spelling; Fetch on the hosted runtime lowercases it.
function exactCaseRequest(url,{method,headers,body}){
 if(globalThis.Deno?.connectTls)return tlsRequest(url,{method,headers,body});
 return new Promise((resolve,reject)=>{
  const req=httpsRequest(url,{method,headers,agent:false},res=>{
   const responseHeaders=new Headers();for(const [key,v] of Object.entries(res.headers))if(v!==undefined)responseHeaders.set(key,Array.isArray(v)?v.join(', '):v);
   resolve({ok:res.statusCode>=200&&res.statusCode<300,status:res.statusCode,headers:responseHeaders,body:res});
  });req.setTimeout(18000,()=>req.destroy(Error('Timeout')));req.on('error',reject);if(body)req.write(body);req.end();
 });
}
export async function tlsRequest(url,{method,headers,body}){
 const target=new URL(url);let connection,expired=false,rejectTimeout;
 const timeout=new Promise((_,reject)=>{rejectTimeout=reject;});
 const deadline=setTimeout(()=>{expired=true;try{connection?.close();}catch{}rejectTimeout(Error('Timeout'));},18000);
 try{
  connection=await Promise.race([Deno.connectTls({hostname:target.hostname,port:443}).then(c=>{if(expired){c.close();throw Error('Timeout');}return c;}),timeout]);
  const payload=body?Buffer.from(body):Buffer.alloc(0),request=Buffer.concat([Buffer.from(method+' '+target.pathname+target.search+' HTTP/1.1\r\nHost: '+target.hostname+'\r\nConnection: close\r\nAccept-Encoding: identity\r\n'+Object.entries(headers).map(([k,v])=>k+': '+v+'\r\n').join('')+(payload.length?'Content-Length: '+payload.length+'\r\n':'')+'\r\n'),payload]);
  let sent=0;while(sent<request.length)sent+=await connection.write(request.subarray(sent));
  const chunks=[];let size=0;while(true){const chunk=new Uint8Array(16384),n=await connection.read(chunk);if(n===null)break;size+=n;if(size>8*1024*1024)throw Error('Response limit');chunks.push(Buffer.from(chunk.subarray(0,n)));}
  const bytes=Buffer.concat(chunks),end=bytes.indexOf('\r\n\r\n');if(end<0)throw Error('Invalid HTTP response');const lines=bytes.subarray(0,end).toString().split('\r\n'),status=Number(lines.shift().split(' ')[1]),responseHeaders=new Headers();for(const line of lines){const at=line.indexOf(':');if(at>0)responseHeaders.append(line.slice(0,at),line.slice(at+1).trim());}
  let data=bytes.subarray(end+4);
  if(/chunked/i.test(responseHeaders.get('transfer-encoding')||'')){const decoded=[];let at=0;while(true){const next=data.indexOf('\r\n',at);if(next<0)throw Error('Invalid chunk');const length=parseInt(data.subarray(at,next).toString().split(';')[0],16);if(!Number.isFinite(length)||length<0)throw Error('Invalid chunk size');if(!length)break;at=next+2;if(at+length+2>data.length)throw Error('Incomplete chunk');decoded.push(data.subarray(at,at+length));at+=length+2;}data=Buffer.concat(decoded);}
  return{ok:status>=200&&status<300,status,headers:responseHeaders,body:[data]};
 }finally{clearTimeout(deadline);try{connection?.close();}catch{}}
}
async function rawTransport(url,{method='GET',headers={},body,allowRedirect=false}={}){
 let r;try{r=headers.Authorization&&Object.values(ORIGINS).includes(new URL(url).origin)?await exactCaseRequest(url,{method,headers,body}):await fetch(url,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(18000)});}catch{throw err('Integração indisponível ou tempo de consulta excedido.');}
 if(!r.ok&&!(allowRedirect&&[302,303].includes(r.status)))throw Object.assign(err('Integração retornou HTTP '+r.status,r.status===429?429:r.status===401||r.status===403?502:503),{upstreamStatus:r.status});
 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>8*1024*1024)throw err('Resposta excedeu o limite seguro. Reduza o período.');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\ufffd'))text=new TextDecoder('windows-1252').decode(bytes);
 return {text,headers:r.headers,status:r.status};
}
async function transport(url,options){const branch=Object.keys(ORIGINS).find(b=>new URL(url).origin===ORIGINS[b]);return branch?withApiBudget(branch,()=>rawTransport(url,options)):rawTransport(url,options);}
function json(text){let data;try{data=JSON.parse(text);}catch{throw err('Integração retornou um formato inválido.');}if(data?.ok===false||data?.success===false||data?.status===false||data?.error||data?.erro)throw err('Integração recusou a consulta.');return data;}
async function authenticate(fn){try{return await fn();}catch(e){if([401,403].includes(e.upstreamStatus)||/não confirmou autenticação|recusou a consulta|não confirmou autenticação/.test(e.message))e.credentialInvalid=true;throw e;}}
export function connectionState(v){const text=String(v??'').trim().toLowerCase();if(['1','true','online','connected','conectado','on'].includes(text))return 'Online';if(['0','false','offline','disconnected','desconectado','off'].includes(text))return 'Off';return 'Não informado';}
export class Integrations{
 constructor({secrets=integrationSecrets,request=transport}={}){this.secrets=secrets;this.request=(url,options)=>measuredRequest(request,url,options);this.sessions=new Map();this.health=new Map();}
 credentials(branch,api=false){const s=this.secrets(),prefix=branch==='imperatriz'?'grupo_rs_modern':'grupo_rs_legacy_'+branch;const username=(api?s['grupo_rs_api_'+branch+'_user']:'')||(api&&branch==='imperatriz'?s.grupo_rs_api_user:'')||s[prefix+'_user']||s.grupo_rs_legacy_user||s.grupo_rs_modern_user;const password=(api?s['grupo_rs_api_'+branch+'_password']:'')||(api&&branch==='imperatriz'?s.grupo_rs_api_password:'')||s[prefix+'_password']||s.grupo_rs_legacy_password||s.grupo_rs_modern_password;if(!username||!password)throw err('Acesso desta base não configurado.');return{username,password};}
 async session(branch){if(!ORIGINS[branch])throw err('Base inválida.',400);let s=this.sessions.get(branch);if(s&&Date.now()-s.at<15*60*1000)return s;s={at:Date.now(),cookies:new Map(),token:''};this.sessions.set(branch,s);return s;}
 async api(branch,path,retry=true){const s=await this.session(branch);if(!s.token){if(!s.login)s.login=authenticate(async()=>{const c=this.credentials(branch,true),r=await this.request(ORIGINS[branch]+'/api_rest_app/api/v1/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:c.username,senha:c.password})});s.token=tokenOf(json(r.text));if(!s.token)throw err('API não confirmou autenticação.');}).catch(e=>{if(e.status!==429)e.message='Autenticação da API: '+e.message;throw e;}).finally(()=>{s.login=null;});await s.login;}
 try{const r=await this.request(ORIGINS[branch]+'/api_rest_app/api/v1'+path,{headers:{Authorization:'Bearer '+s.token,Accept:'application/json'}});return json(r.text);}catch(e){if(retry&&e.upstreamStatus===401){s.token='';return this.api(branch,path,false);}if(e.upstreamStatus===401)e.credentialInvalid=true;if(e.upstreamStatus===403)e.message='Permissão recusada para esta consulta da API; as demais rotas permanecem disponíveis.';e.message='Consulta autenticada da API: '+e.message;throw e;}}
 async portal(){throw err('Consulta ao portal desativada: integração exclusiva pela API v2.',501);}
 async vehicles(branch,serial){
  if(!/^\d{6,17}$/.test(serial))throw err('Informe a série numérica exata.',400);
  const data=await this.api(branch,'/veiculos?q='+encodeURIComponent(serial)+'&skip=0&take=50');
  const found=rows(data);if(data.paginacao?.temMais||found.length>=50)throw err('Consulta ampla; vínculo único não confirmado.');
  const exact=found.filter(r=>serialOf(r)===serial).map(normalize);
  if(exact.length||!found.length)return exact;
  // Summary lists omit the tracker. Confirm the relationship using the exact equipment response.
  if(found.length!==1||serialOf(found[0]))throw err('Veículo único não confirmado para esta série.',422);
  const vehicle=normalize(found[0]),equipment=await this.equipment(branch,serial);
  if(!/^[1-9]\d*$/.test(vehicle.vehicle_id)||equipment.vehicle_id!==vehicle.vehicle_id||!vehicle.plate||equipment.plate!==vehicle.plate)throw err('Vínculo divergente entre aparelho e veículo.',422);
  return[{...vehicle,serial,equipment_id:equipment.id}];
 }
 async associationOwner(branch,vehicle,hint='RS300',{fresh=false}={}){
  const name=String(hint||'RS300').trim();if(name.length<3||name.length>160)return null;
  this.ownerLookups??=new Map();const key=branch+'|'+name.toLocaleUpperCase('pt-BR'),now=Date.now();
  for(const [k,v] of this.ownerLookups)if(now-v.at>30000)this.ownerLookups.delete(k);
  let cached=!fresh&&this.ownerLookups.get(key);
  if(!cached){cached={at:now,promise:this.api(branch,'/associados?q='+encodeURIComponent(name)+'&take=20')};if(!fresh)this.ownerLookups.set(key,cached);}
  let data;try{data=await cached.promise;}catch(e){if(this.ownerLookups.get(key)===cached)this.ownerLookups.delete(key);throw e;}
  if(!Array.isArray(data.associados))return null;
  const matches=[];
  for(const client of data.associados){const id=value(client,['codCliente','codAssociado']),clientName=value(client,['nome','nomeCliente']);
   if(!/^[1-9]\d*$/.test(id)||clientName.toLocaleUpperCase('pt-BR')!==name.toLocaleUpperCase('pt-BR')||!Array.isArray(client.veiculos))continue;
   for(const raw of client.veiculos){const v=normalize(raw);if(v.vehicle_id===vehicle.vehicle_id&&v.plate===vehicle.plate&&v.serial===vehicle.serial&&v.equipment_id&&v.equipment_id===vehicle.equipment_id)matches.push({client:clientName,client_id:id,owner_source:'associados'});}
  }
  return matches.length===1?matches[0]:null;
 }
 async binding(branch,serial,clientHint='RS300',options={}){const found=await this.vehicles(branch,serial);if(found.length!==1)return{ok:false,category:'review',message:found.length?'Mais de um vínculo exato.':'Nenhum vínculo exato retornado.',serial};const row=found[0];if(!row.client&&!(Number(row.owner_count)>1)&&row.vehicle_id&&row.equipment_id){const owner=await this.associationOwner(branch,row,clientHint,options);if(owner)Object.assign(row,owner);}if(!row.client||Number(row.owner_count)>1)return{...row,ok:false,category:'review',association_confirmed:true,owner_status:Number(row.owner_count)>1?'ambiguous':'unavailable',message:Number(row.owner_count)>1?'Associação confirmada, mas a API informa múltiplos titulares. Confira antes da baixa.':'Associação com a placa confirmada. A API não informou o titular; a baixa automática permanece indisponível.',source:ORIGINS[branch],queried_at:new Date().toISOString()};const compact=row.plate.replace(/\W/g,'').toUpperCase();const internal=/^(AAA|GRS|XRS|NOV)/.test(compact);const stock=row.client.toUpperCase()==='RS300'&&(internal||! /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(compact));const ok=!stock&&!internal&&/^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(compact)&&row.client.toUpperCase()!=='RS300';return{...row,ok,category:stock?'stock':ok?'eligible':'review',message:stock?'Permanece em estoque':ok?'Vínculo confirmado':'Conferir vínculo',source:ORIGINS[branch],queried_at:new Date().toISOString()};}
 async maintenance(){throw err('A API v2 não oferece a lista de veículos em manutenção. Consulta ao portal desativada.',501);}
 async equipment(branch,serial){if(!/^\d{6,17}$/.test(serial))throw err('Série inválida.',400);const d=await this.api(branch,'/equipamentos?q='+encodeURIComponent(serial)+'&skip=0&take=50');const all=rows(d);const matches=all.filter(r=>serialOf(r)===serial);if(!all.length&&!d.paginacao?.temMais)throw err('A série não foi retornada pela API desta base. Confira o cadastro do aparelho e o escopo de acesso.',422);if(d.paginacao?.temMais||all.length>=50||matches.length!==1)throw err('Aparelho único não confirmado na API.',422);const raw=matches[0],id=value(raw,['codEquipamento','idEquipamento','equipment_id','id']);if(!/^\d+$/.test(id)||Number(id)<=0||['I','INATIVO','INACTIVE','0'].includes(value(raw,['status','situacao','ativo']).toUpperCase()))throw err('Aparelho inativo ou sem código confirmado.',422);return{...normalize(raw),id,ok:true,binding_known:Object.hasOwn(raw,'veiculo'),status:value(raw,['ativo','status','situacao']),carrier:value(raw,['nomeOperadora','operadora'])||({1:'Vivo',3:'Claro',4:'Tim',6:'Multioperadora'}[Number(raw.codOperadora)]||''),plate:value(raw.veiculo,['placa']),vehicle_id:value(raw.veiculo,['codVeiculo']),api_version:2};}
 async lookupEquipment(branch,q){
  if(typeof q!=='string'||q.length<3||q.length>80)throw err('Busca inválida.',400);
  if(/^\d{9}$/.test(q))return this.equipment(branch,q);
  const identification=/^(?:(XRS|GRS|AAA)[ -]*\d+|[A-Z]{3}[ -]*\d[A-Z0-9]\d{2})$/i.test(q);
  const data=await this.api(branch,(identification?'/veiculos':'/equipamentos')+'?q='+encodeURIComponent(q)+'&skip=0&take=50');
  const key=v=>String(v||'').replace(/[ -]/g,'').toUpperCase();
  const all=rows(data),matches=all.map(raw=>({...normalize(raw),plate:value(raw,['placa','plate'])||value(raw.veiculo,['placa'])})).filter(r=>[r.serial,r.iccid,r.phone,r.plate].some(v=>v&&key(v)===key(q)));
  if(data.paginacao?.temMais||all.length>=50||matches.length!==1||!matches[0].serial)throw err('Correspondência única não confirmada. Informe a série ou use o cadastro manual.',422);
  const equipment=await this.equipment(branch,matches[0].serial);return {...matches[0],...equipment,plate:equipment.plate||matches[0].plate};
 }
 async equipmentPortal(branch,serial){return this.equipment(branch,serial);}
 async linkStockOwner(branch){
  const d=await this.api(branch,'/associados?q=RS300&take=20');
  const owners=(d.associados||[]).filter(r=>value(r,['nome','nomeCliente']).toUpperCase()==='RS300');
  if(owners.length!==1||!/^[1-9]\d*$/.test(value(owners[0],['codCliente','codAssociado']))||!Array.isArray(owners[0].veiculos))throw err('Titular RS300 único não confirmado pela API.',422);
  return{id:value(owners[0],['codCliente','codAssociado']),vehicles:owners[0].veiculos.map(normalize)};
 }
 async prepareLink(branch,serial,identification){
  const compact=String(identification||'').trim().toUpperCase().replace(/[\s-]/g,'');
  if(!/^(AAA|GRS|XRS)\d{1,6}$/.test(compact))throw err('Informe identificação AAA, GRS ou XRS com um a seis números.',400);
  const plate=compact.slice(0,3)+' - '+compact.slice(3),equipment=await this.equipment(branch,serial);
  const found=new Map();
  for(const q of [plate]){
   const d=await this.api(branch,'/veiculos?q='+encodeURIComponent(q)+'&skip=0&take=50');
   if(!Array.isArray(d.veiculos)||typeof d.paginacao?.temMais!=='boolean'||d.paginacao.temMais)throw err('Identificação única não confirmada pela API.',422);
   for(const raw of d.veiculos){const v=normalize(raw);if(v.plate.replace(/\W/g,'').toUpperCase()===compact)found.set(v.vehicle_id,v);}
   if(found.size)break;
  }
  if(!found.size){
   if(equipment.vehicle_id)throw err('O aparelho já está vinculado a outro veículo. Nenhuma identificação será criada.',409);
   const owner=await this.linkStockOwner(branch);
   return{plate,serial,confirmed:false,create_required:true,payload:{serial,plate,vehicle_id:'',equipment_id:equipment.id,client_id:owner.id,create_required:true}};
  }
  if(found.size!==1)throw err('Mais de um veículo possui essa identificação. Confira na base.',422);
  let target=[...found.values()][0];
  if(!target.client){const owner=await this.linkStockOwner(branch),matches=owner.vehicles.filter(v=>v.vehicle_id===target.vehicle_id&&v.plate===plate);
   if(matches.length!==1)throw err('A API não confirmou esta identificação entre os veículos do RS300.',422);
   target={...matches[0],client:'RS300',client_id:owner.id};
  }
  if(!/^[1-9]\d*$/.test(target.vehicle_id)||!target.client_id||target.client.toUpperCase()!=='RS300'||Number(target.owner_count)>1)throw err('Titular RS300 único não confirmado para esta identificação.',422);
  if((target.equipment_id&&target.equipment_id!==equipment.id)||(target.serial&&target.serial!==serial))throw err('A identificação já possui outro aparelho. Nenhum vínculo será substituído.',409);
  if(equipment.vehicle_id&&equipment.vehicle_id!==target.vehicle_id)throw err('O aparelho está vinculado a outro veículo. Revise a desvinculação na base antes de continuar.',409);
  const confirmed=target.serial===serial&&equipment.vehicle_id===target.vehicle_id;
  if(!confirmed&&(target.serial||equipment.vehicle_id))throw err('A API retornou vínculo divergente entre aparelho e veículo. Consulte novamente.',409);
  return{plate,serial,confirmed,payload:{serial,plate,vehicle_id:target.vehicle_id,equipment_id:equipment.id,client_id:target.client_id}};
 }
 async createLink(branch,payload){
  if(!payload||!payload.serial||!payload.plate)throw err('Pedido de vínculo inválido.',400);
  let fresh=await this.prepareLink(branch,payload.serial,payload.plate);
  for(const key of ['vehicle_id','equipment_id','client_id'])if(fresh.payload[key]!==payload[key])throw err('O cadastro remoto mudou. Revise o vínculo antes de continuar.',409);
  if(!!fresh.create_required!==!!payload.create_required)throw err('A identificação mudou durante a revisão.',409);
  if(fresh.confirmed)return{ok:true};
  if(fresh.create_required){
   const created=await this.apiPost(branch,'/veiculos',{placa:payload.plate,codCliente:Number(payload.client_id),codEquipamento:Number(payload.equipment_id),moverEquipamento:false});
   const id=value(created.veiculo,['codVeiculo']);
   if(!/^[1-9]\d*$/.test(id)||value(created.veiculo,['placa'])!==payload.plate||value(created,['codCliente'])!==payload.client_id||value(created,['nomeCliente']).toUpperCase()!=='RS300')throw err('Criação enviada, mas titular e identificação não foram confirmados. Confira a operação sem reenviar.',409);
   fresh=await this.prepareLink(branch,payload.serial,payload.plate);
   if(fresh.create_required||fresh.payload.vehicle_id!==id||fresh.payload.client_id!==payload.client_id||fresh.payload.equipment_id!==payload.equipment_id)throw err('A criação precisa de conferência. Nenhum vínculo foi enviado.',409);
   if(fresh.confirmed)return{ok:true};
  }
  return this.apiPost(branch,'/veiculos/'+fresh.payload.vehicle_id+'/equipamento',{codEquipamento:Number(payload.equipment_id),mover:false});
 }
 async apiPost(branch,path,payload){
  const creation=path==='/veiculos'&&/^(AAA|GRS|XRS) - \d{1,6}$/.test(payload.placa||'')&&Number.isSafeInteger(payload.codCliente)&&payload.codCliente>0&&payload.moverEquipamento===false&&Object.keys(payload).every(k=>['placa','codCliente','codEquipamento','moverEquipamento'].includes(k));const association=/^\/veiculos\/[1-9]\d*\/equipamento$/.test(path)&&payload.mover===false&&Object.keys(payload).every(k=>['codEquipamento','mover'].includes(k));if((!creation&&!association)||!Number.isSafeInteger(payload.codEquipamento)||payload.codEquipamento<=0)throw err('Escrita da API não autorizada para este fluxo.',400);
  const session=await this.session(branch);
  if(!session.token)await this.api(branch,'/veiculos?skip=0&take=1');
  try{const result=await this.request(ORIGINS[branch]+'/api_rest_app/api/v1'+path,{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});return json(result.text);}
  catch(e){if(e.upstreamStatus===401){session.token='';e.credentialInvalid=true;}throw e;} // Never retry a write; the durable operation reconciles using reads.
 }
 async equipmentByCode(branch,serial,id){
  if(!/^\d{6,17}$/.test(serial)||!/^[1-9]\d*$/.test(String(id)))throw err('Código ou série inválidos.',400);
  const data=await this.api(branch,'/equipamentos/'+id),raw=data.equipamento;
  if(data.ok===false||!raw||value(raw,['codEquipamento'])!==String(id)||serialOf(raw)!==serial)throw err('Código salvo não confirmou este aparelho. Atualize aparelhos antes de analisar.',422);
  if(['0','FALSE','I','INATIVO','INACTIVE'].includes(value(raw,['ativo','status']).toUpperCase()))throw err('Aparelho inativo na API.',422);
  return{...normalize(raw),ok:true,id:String(id),binding_known:Object.hasOwn(raw,'veiculo'),vehicle_id:value(raw.veiculo,['codVeiculo']),plate:value(raw.veiculo,['placa'])};
 }
 async equipmentLocation(branch,serial,codes=null){
  const e=codes||await this.equipment(branch,serial);
  if(!/^[1-9]\d*$/.test(e.vehicle_id))throw err('Aparelho sem veículo confirmado.',422);
  const d=await this.api(branch,'/veiculos/'+e.vehicle_id+'/comunicacao');
  if(value(d.veiculo,['codVeiculo'])!==e.vehicle_id||serialOf(d.equipamento)!==serial||(e.equipment_id&&value(d.equipamento,['codEquipamento'])!==String(e.equipment_id))||!d.comunicacao||typeof d.comunicacao!=='object')throw err('Comunicação não confirmou este aparelho. Atualize aparelhos para conferir os códigos salvos.',422);
  return{...normalize(d.comunicacao),ok:true,serial,plate:value(d.veiculo,['placa']),vehicle_id:e.vehicle_id,source:ORIGINS[branch],queried_at:new Date().toISOString()};
 }
 async location(branch,serial,plateHint=''){
  let matches=await this.vehicles(branch,serial),fromPlate=false;
  if(!matches.length&&plateHint){
   const compact=String(plateHint).toUpperCase().replace(/[\s-]/g,'');
   if(!/^[A-Z0-9]{3,12}$/.test(compact))throw err('Placa local inválida para conferência.',422);
   const listed=await this.api(branch,'/veiculos?q='+encodeURIComponent(String(plateHint).trim())+'&skip=0&take=50');
   if(!Array.isArray(listed.veiculos)||listed.paginacao?.temMais!==false||listed.veiculos.length>=50)throw err('Busca por placa não confirmou um veículo único.',422);
   matches=rows(listed).map(normalize).filter(v=>v.plate.toUpperCase().replace(/[\s-]/g,'')===compact);fromPlate=true;
  }
  if(matches.length!==1||!/^[1-9]\d*$/.test(matches[0].vehicle_id))throw err('Vínculo do veículo não confirmado.',422);
  const vehicle=matches[0],d=await this.api(branch,'/veiculos/'+vehicle.vehicle_id+'/comunicacao');
  const remoteSerial=serialOf(d.equipamento);
  if(value(d.veiculo,['codVeiculo'])!==vehicle.vehicle_id||!d.comunicacao||typeof d.comunicacao!=='object'||(remoteSerial&&remoteSerial!==serial)||(fromPlate&&remoteSerial!==serial))throw err('Comunicação não confirmou a série neste veículo. Atualize o cadastro ou confira o vínculo.',422);
  return{...normalize(d.comunicacao),ok:true,serial,plate:vehicle.plate,vehicle_id:vehicle.vehicle_id,client:vehicle.client,source:ORIGINS[branch],queried_at:new Date().toISOString()};
 }
 async stockDetails(branch,serial,plateHint=''){
 const capture=async fn=>{try{return await fn();}catch(e){return{ok:false,message:e.message};}};
 const [equipment,location]=await Promise.all([capture(()=>this.equipmentPortal(branch,serial)),capture(()=>this.location(branch,serial,plateHint))]);
 let chip={ok:false,message:'ICCID não confirmado na plataforma.'};
 if(/^89\d{17,18}$/.test(equipment.iccid||'')){
  const first=await capture(()=>this.carrier('arya',equipment.iccid));
  if(first.ok)chip=first;
  else {const second=await capture(()=>this.carrier('link',equipment.iccid));chip=second.ok?second:{ok:false,message:'Arya: '+first.message+' • Link: '+second.message};}
 }
 if(chip.ok&&chip.iccid===equipment.iccid&&!/^[0-9]{10,13}$/.test(String(equipment.phone||'').replace(/\D/g,''))&&/^[0-9]{10,13}$/.test(String(chip.phone||'').replace(/\D/g,'')))equipment.phone=chip.phone;
 return{api_version:2,serial,equipment,location,chip,source:ORIGINS[branch],queried_at:new Date().toISOString()};
 }
 async clients(branch,q,mode='vehicle'){
  if(!['name','vehicle'].includes(mode))throw err('Tipo de busca inválido.',400);
  if(typeof q!=='string'||q.trim().length<3||q.length>120)throw err('Informe ao menos três caracteres para pesquisar.',400);
  if(mode==='name'){
   const data=await this.api(branch,'/associados?q='+encodeURIComponent(q.trim())+'&take=20');
   if(data.ok===false||!Array.isArray(data.associados))throw err('Lista de titulares não confirmada na API.');
   if(data.associados.length>=20||data.paginacao?.temMais)throw err('Muitos titulares encontrados. Refine o nome.',422);
   const clients=new Map();
   for(const raw of data.associados){const id=value(raw,['codCliente'])||value(raw,['codAssociado']),associated=value(raw,['codAssociado']),name=value(raw,['nome','nomeCliente','nomeAssociado']);
    if(!/^[1-9]\d*$/.test(id)||!name||(associated&&associated!==id))throw err('Identidade do titular não confirmada na API.',422);
    if(clients.has(id)&&clients.get(id).name!==name)throw err('Titular divergente na API.',422);
    clients.set(id,{id,name});
   }
   return [...clients.values()];
  }
  const data=await this.api(branch,'/veiculos?q='+encodeURIComponent(q.trim())+'&skip=0&take=50');
  if(!Array.isArray(data.veiculos)||typeof data.paginacao?.temMais!=='boolean')throw err('Lista de veículos não confirmada na API.');
  if(data.paginacao.temMais)throw err('Muitos veículos encontrados. Refine a placa, série ou identificação.',422);
  const clients=new Map();
  for(const raw of data.veiculos){const v=normalize(raw);if(!/^[1-9]\d*$/.test(v.client_id)||!v.client||Number(v.owner_count)>1)throw err('Titular ausente ou vínculo ambíguo na API. Refine a consulta.',422);
   const previous=clients.get(v.client_id);if(previous&&previous.name!==v.client)throw err('Titular divergente na API.',422);
   clients.set(v.client_id,{id:v.client_id,name:v.client});
  }
  return [...clients.values()];
 }
 async clientVehicles(branch,clientId,clientName){
  if(branch!=='imperatriz'||!/^\d+$/.test(clientId)||!clientName)throw err('Consulta de atendimento disponível em Imperatriz com cliente selecionado.',422);
  const result=[],seen=new Set(),ids=new Set();let skip=0;
  for(let page=0;page<10;page++){
   const data=await this.api(branch,'/clientes/'+clientId+'/veiculos?skip='+skip+'&take=50');
   if(!Array.isArray(data.veiculos)||typeof data.paginacao?.temMais!=='boolean')throw err('Veículos do cliente não confirmados na API.',422);
   if(data.veiculos.some(raw=>!normalize(raw).client_id))return this.associatedVehicles(branch,clientId,clientName);
   for(const raw of data.veiculos){const v=normalize(raw),key=v.plate.replace(/\W/g,'').toUpperCase();
    if(v.client_id!==clientId||v.client!==clientName||Number(v.owner_count)>1)throw err('Titular do veículo mudou. Consulte novamente.',422);
    if(!key||!v.vehicle_id||seen.has(key)||ids.has(v.vehicle_id))throw err('Vínculo ambíguo na API.',422);
    seen.add(key);ids.add(v.vehicle_id);result.push({...v,model:value(raw,['modelo'])});
   }
   if(!data.paginacao.temMais)return result;
   const next=data.paginacao.proximoSkip;if(!Number.isInteger(next)||next<=skip)throw err('Paginação dos veículos inválida.');skip=next;
  }
  throw err('Lista extensa de veículos; confirmação completa indisponível.',422);
 }
 async associatedVehicles(branch,clientId,clientName){
  if(typeof clientName!=='string'||clientName.length<3||clientName.length>120)throw err('Nome do titular inválido.',422);
  const data=await this.api(branch,'/associados?q='+encodeURIComponent(clientName)+'&take=20');
  if(data.ok===false||!Array.isArray(data.associados)||data.associados.length>=20||data.paginacao?.temMais)throw err('Lista de titulares incompleta. Refine a consulta.',422);
  const matches=data.associados.filter(r=>(value(r,['codCliente'])||value(r,['codAssociado']))===clientId);
  if(matches.length!==1)throw err('Titular único não confirmado na API.',422);
  const owner=matches[0],associated=value(owner,['codAssociado']);
  if(value(owner,['nome','nomeCliente','nomeAssociado'])!==clientName||(associated&&associated!==clientId)||!Array.isArray(owner.veiculos)||owner.paginacao?.temMais)throw err('Titular ou veículos não confirmados na API.',422);
  const seen=new Set(),ids=new Set();
  return owner.veiculos.map(raw=>{const v=normalize(raw),key=v.plate.replace(/\W/g,'').toUpperCase();
   if(!key||!v.vehicle_id||seen.has(key)||ids.has(v.vehicle_id)||Number(v.owner_count)>1||(v.client_id&&v.client_id!==clientId)||(v.client&&v.client!==clientName))throw err('Vínculo ambíguo na API.',422);
   seen.add(key);ids.add(v.vehicle_id);return {...v,client_id:clientId,client:clientName,model:value(raw,['modelo'])};
  });
 }
 async history(branch,serial,start,end){
  if(![start,end].every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(v)))throw err('Informe data e horário válidos de até sete dias.',400);
  const a=Date.parse(start),b=Date.parse(end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||b-a>7*86400000)throw err('Informe um período válido de até sete dias.',400);
  const matches=await this.vehicles(branch,serial);if(matches.length!==1||!/^\d+$/.test(matches[0].vehicle_id))throw err('Veículo único não confirmado.',422);
  const context=matches[0],result=[];let skip=0;
  for(let page=0;page<20;page++){
   const q=new URLSearchParams({inicio:start.replace('T',' '),fim:end.replace('T',' '),skip:String(skip),take:'100'});
   const d=await this.api(branch,'/veiculos/'+context.vehicle_id+'/posicoes?'+q);
   if(String(d.codVeiculo)!==context.vehicle_id||!Array.isArray(d.posicoes)||typeof d.paginacao?.temMais!=='boolean')throw err('Histórico incompleto ou de outro veículo.');
   result.push(...d.posicoes.map(r=>({id:value(r,['id','codPosicao']),gps_at:value(r,['data','dataGPS','dataEvento','data_completa']),server_at:value(r,['dataComunicacao','dataServidor']),lat:value(r,['latitude','lat']),lng:value(r,['longitude','lng']),speed:value(r,['velocidade']),ignition:value(r,['ignicao']),battery:value(r,['bateria']),internal_battery:value(r,['bateriaInterna']),memory:String(r.memoria)==='1'})));
   const out={ok:true,rows:result,partial:d.paginacao.temMais,distance:null,context,source:ORIGINS[branch]};
   if(!d.paginacao.temMais||page===19)return out;
   const next=d.paginacao.proximoSkip;if(!Number.isInteger(next)||next<=skip)throw err('Paginação do histórico inválida.');skip=next;
  }
 }
 async carrier(provider,iccid,retry=true){if(!['arya','link'].includes(provider)||!/^89\d{17,18}$/.test(iccid))throw err('Operadora ou ICCID inválido.',400);const s=this.secrets();const base=provider==='arya'?'https://api-arya.hinovaconecta.com.br':'https://lsm.tnsi.com.br';const key='carrier-'+provider;let auth=this.sessions.get(key);if(!auth||Date.now()-auth.at>900000){const payload=provider==='arya'?{email:s.arya_email,password:s.arya_password}:{username:s.linksolutions_email,password:s.linksolutions_password,rememberMe:true,blockInit:false};if(!payload.password)throw err('Credenciais da operadora não configuradas.');const response=await authenticate(()=>this.request(base+(provider==='arya'?'/auth':'/api/authenticate'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));auth={token:response.headers.get('authorization')?.replace(/^Bearer /,'')||await authenticate(async()=>tokenOf(json(response.text))),at:Date.now()};if(!auth.token)throw Object.assign(err('Operadora não confirmou autenticação.'),{credentialInvalid:true});this.sessions.set(key,auth);}
 let response;try{response=await this.request(base+(provider==='arya'?'/customer/inventary':'/api/sims?size=10&page=1&field=iccid&value='+encodeURIComponent(iccid)+'&order=-last_conn'),{method:provider==='arya'?'POST':'GET',headers:{Authorization:'Bearer '+auth.token,'Content-Type':'application/json'},body:provider==='arya'?JSON.stringify({per_page:10,filters:{iccid}}):undefined});}catch(e){if(retry&&e.upstreamStatus===401){this.sessions.delete(key);return this.carrier(provider,iccid,false);}throw e;}const matches=rows(json(response.text)).filter(r=>value(r,['iccid','numeroChip'])===iccid);if(matches.length!==1)return{ok:false,message:'Chip exato não confirmado.',provider};const r=matches[0];return{ok:true,provider,iccid,status:value(r,['status__name','status_name','status','situacao','state','sim_status']),connectivity:connectionState(value(r,provider==='arya'?['conn_status','inSession']:['connection_status','connectionStatus','status__name','status_name'])),phone:value(r,['msisdn','number','phone','telefone']),operator:value(r,['provider','operator__name','operator','operadora','carrier']),queried_at:new Date().toISOString()};}
}
export const integrations=new Integrations();
