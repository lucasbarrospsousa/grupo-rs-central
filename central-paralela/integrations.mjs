// Adaptador isolado das APIs existentes; transporte permite somente consultas e autenticação.
import {CredentialSessions} from './integration-sessions.mjs';


import {request as httpsRequest} from 'node:https';
import {Buffer} from 'node:buffer';
const integrationSecrets=()=>{throw Error('Credenciais não configuradas.');};
export const ORIGINS={imperatriz:'https://imp.ogrupors.com.br',araguaina:'https://arg.ogrupors.com.br',acailandia:'https://acl.ogrupors.com.br',maraba:'https://mab.ogrupors.com.br'};
const err=(message,status=502)=>Object.assign(Error(message),{status});
export function value(row,keys){for(const k of keys){const key=Object.keys(row||{}).find(x=>x.toLowerCase()===k.toLowerCase());const v=row?.[key];if(v!==null&&v!==undefined&&typeof v!=='object'&&String(v).trim())return String(v).trim();}return '';}
export function rows(data){if(Array.isArray(data))return data.filter(x=>x&&typeof x==='object');if(!data||typeof data!=='object')return [];for(const k of ['data','dados','associados','posicoes','veiculos','vehicles','equipamentos','equipment','localizacao','localizacoes','locations','items','rows','results','records','content','result','inventary','sims']){if(data[k]!==undefined){const found=rows(data[k]);if(found.length)return found;}}return Object.keys(data).some(k=>/^(placa|plate|serial|imei|iccid|numeroEquipamento)$/i.test(k))?[data]:[];}
export function serialOf(row){for(const source of [row,row?.equipamento,row?.equipment,row?.tracker])for(const k of ['serial','numero_serie','numeroSerie','numeroSerieEquipamento','serialEquipamento','imei','numeroEquipamento','numero_equipamento','equipment_number']){const v=value(source,[k]);if(/^\d{6,17}$/.test(v))return v;}return '';}
function tokenOf(data){if(!data||typeof data!=='object')return '';const t=value(data,['token','access_token','accessToken','jwt','id_token']);if(t)return t;for(const v of Object.values(data)){const nested=tokenOf(v);if(nested)return nested;}return '';}
export function plain(html){return String(html).replace(/<[^>]*>/g,'').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&(amp|nbsp|lt|gt|quot|apos|atilde|ccedil|iacute);/g,(_,n)=>({amp:'&',nbsp:' ',lt:'<',gt:'>',quot:'"',apos:"'",atilde:'ã',ccedil:'ç',iacute:'í'}[n])).trim();}
export function table(html){const body=html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];if(body===undefined||/<form[^>]*action=["'][^"']*login\.php/i.test(html))throw err('Portal não confirmou a sessão ou o formato da resposta.');return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>({html:m[1],cells:[...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>plain(c[1]))}));}
export function normalize(raw){const row={...raw};for(const k of ['localizacao','location','posicao','position','ultimaPosicao','lastPosition','telemetria','telemetry','dados','coordinates'])if(raw?.[k]&&typeof raw[k]==='object'&&!Array.isArray(raw[k]))for(const [name,v] of Object.entries(raw[k]))if(row[name]===undefined)row[name]=v;return {serial:serialOf(row),plate:value(row,['placa','plate','placaVeiculo']),client:value(row.titular,['nomeCliente'])||(/^[1-9]\d*$/.test(value(row,['codCliente']))?value(row,['nomeCliente']):'')||value(row,['cliente','client','nomeClienteTitular','nomeAssociado']),client_id:value(row.titular,['codCliente'])||value(row,['codCliente']),equipment_id:value(row.equipamento,['codEquipamento']),owner_count:value(row,['qtdClientesVinculadosAtivos']),vehicle_id:value(row,['veiculo_id','vehicle_id','veiculoId','vehicleId','codVeiculo','idVeiculo','id_veiculo','id']),phone:value(row,['telefone','numeroTelefone','phone']),iccid:value(row,['iccid','numeroChip','chip']),apn:value(row,['apn']),lat:value(row,['latitude','lat']),lng:value(row,['longitude','lng','lon']),speed:value(row,['velocidade','speed']),ignition:value(row,['ignicao','ignition','StatusIgnicao','status_ignicao']),battery:value(row,['bateria','battery','voltage']),internal_battery:value(row,['bateriaInterna','internal_battery']),internal_battery_voltage:value(row,['bateriaInternaVoltagem','internal_battery_voltage']),internal_battery_voltage_origin:value(row,['bateriaInternaVoltagemOrigem','internal_battery_voltage_origin']),updated_at:value(row,['ultima_comunicacao','dataServidor','DataServidor','DataComunicacao','data_comunicacao','updated_at']),gps_at:value(row,['dataGPS','gps_at','dataEvento']),gps_signal:value(row,['sinalGps','gps_signal'])};}
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

 const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>8*1024*1024)throw err('Resposta excedeu o limite seguro. Reduza o período.');chunks.push(chunk);}
 const bytes=Buffer.concat(chunks);let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\ufffd'))text=new TextDecoder('windows-1252').decode(bytes);
 if(!r.ok&&!(allowRedirect&&[302,303].includes(r.status)))throw Object.assign(err('Integração retornou HTTP '+r.status,r.status===429?429:r.status===401||r.status===403?502:503),{upstreamStatus:r.status,upstreamBody:text});
 return {text,headers:r.headers,status:r.status};
}
async function transport(url,options={}){
 const u=new URL(url),method=options.method||'GET';
 const bases=Object.values(ORIGINS);
 const allowed=bases.includes(u.origin)?method==='GET'||(method==='POST'&&u.pathname==='/api_rest_app/api/v1/login'):u.origin==='https://api-arya.hinovaconecta.com.br'?method==='POST'&&['/auth','/customer/inventary'].includes(u.pathname):u.origin==='https://lsm.tnsi.com.br'?((method==='POST'&&u.pathname==='/api/authenticate')||(method==='GET'&&u.pathname==='/api/sims')):false;
 if(!allowed)throw err('Operação externa não habilitada na Central paralela.',405);
 return rawTransport(url,options);
}

function json(text){let data;try{data=JSON.parse(text);}catch{throw err('Integração retornou um formato inválido.');}if(data?.ok===false||data?.success===false||data?.status===false||data?.error||data?.erro)throw err('Integração recusou a consulta.');return data;}
async function authenticate(fn){try{return await fn();}catch(e){if([401,403].includes(e.upstreamStatus)||/não confirmou autenticação|recusou a consulta|não confirmou autenticação/.test(e.message))e.credentialInvalid=true;throw e;}}
export function connectionState(v){const text=String(v??'').trim().toLowerCase();if(['1','true','online','connected','conectado','on'].includes(text))return 'Online';if(['0','false','offline','disconnected','desconectado','off'].includes(text))return 'Off';if(['standby','stand-by','stand by'].includes(text))return 'Standby';return 'Não informado';}
export class Integrations{
 constructor({secrets=integrationSecrets,request=transport,sessionStore={api:new Map(),web:new Map()}}={}){
  this.secrets=secrets;this.request=request;
  this.sessions=new CredentialSessions(sessionStore.api,key=>{
   if(key.startsWith('carrier-')){const s=this.secrets();return key==='carrier-arya'?[s.arya_email,s.arya_password]:[s.linksolutions_email,s.linksolutions_password];}
   return this.credentials(key,true);
  });
  this.portalSessions=new CredentialSessions(sessionStore.web,branch=>this.credentials(branch));this.health=new Map();
 }
 credentials(branch,api=false){const s=this.secrets(),prefix=branch==='imperatriz'?'grupo_rs_modern':'grupo_rs_legacy_'+branch;const username=(api?s['grupo_rs_api_'+branch+'_user']:'')||(api&&branch==='imperatriz'?s.grupo_rs_api_user:'')||s[prefix+'_user']||s.grupo_rs_legacy_user||s.grupo_rs_modern_user;const password=(api?s['grupo_rs_api_'+branch+'_password']:'')||(api&&branch==='imperatriz'?s.grupo_rs_api_password:'')||s[prefix+'_password']||s.grupo_rs_legacy_password||s.grupo_rs_modern_password;if(!username||!password)throw err('Acesso desta base não configurado.');return{username,password};}
 async session(branch){if(!ORIGINS[branch])throw err('Base inválida.',400);let s=this.sessions.get(branch);if(s&&Date.now()-s.at<15*60*1000)return s;s={at:Date.now(),cookies:new Map(),token:''};this.sessions.set(branch,s);return s;}
 async api(branch,path,retry=true){const s=await this.session(branch);if(!s.token){if(!s.login)s.login=authenticate(async()=>{const c=this.credentials(branch,true),r=await this.request(ORIGINS[branch]+'/api_rest_app/api/v1/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({usuario:c.username,senha:c.password})});s.token=tokenOf(json(r.text));s.at=Date.now();if(!s.token)throw err('API não confirmou autenticação.');}).catch(e=>{if(e.status!==429)e.message='Autenticação da API: '+e.message;throw e;}).finally(()=>{s.login=null;});await s.login;}
 const usedToken=s.token;try{const r=await this.request(ORIGINS[branch]+'/api_rest_app/api/v1'+path,{headers:{Authorization:'Bearer '+usedToken,Accept:'application/json'}});return json(r.text);}catch(e){if(retry&&e.upstreamStatus===401){if(s.token===usedToken)s.token='';return this.api(branch,path,false);}if(e.upstreamStatus===401)e.credentialInvalid=true;if(e.upstreamStatus===403)e.message='Permissão recusada para esta consulta da API; as demais rotas permanecem disponíveis.';e.message='Consulta autenticada da API: '+e.message;throw e;}}
 async vehicles(branch,serial,{equipment:knownEquipment}={}){
  if(!/^\d{6,17}$/.test(serial))throw err('Informe a série numérica exata.',400);
  const data=await this.api(branch,'/veiculos?q='+encodeURIComponent(serial)+'&skip=0&take=50');
  const found=rows(data);if(data.paginacao?.temMais||found.length>=50)throw err('Consulta ampla; vínculo único não confirmado.');
  const exact=found.filter(r=>serialOf(r)===serial).map(normalize);
  if(exact.length||!found.length)return exact;
  // Summary lists omit the tracker. Confirm the relationship using the exact equipment response.
  if(found.length!==1||serialOf(found[0]))throw err('Veículo único não confirmado para esta série.',422);
  const vehicle=normalize(found[0]),equipment=knownEquipment?.ok&&knownEquipment.serial===serial?knownEquipment:await this.equipment(branch,serial);
  if(!/^[1-9]\d*$/.test(vehicle.vehicle_id)||equipment.vehicle_id!==vehicle.vehicle_id||!vehicle.plate||equipment.plate!==vehicle.plate)throw err('Vínculo divergente entre aparelho e veículo.',422);
  return[{...vehicle,serial,equipment_id:equipment.id}];
 }
 async equipment(branch,serial){if(!/^\d{6,17}$/.test(serial))throw err('Série inválida.',400);const d=await this.api(branch,'/equipamentos?q='+encodeURIComponent(serial)+'&skip=0&take=50');const all=rows(d);const matches=all.filter(r=>serialOf(r)===serial);if(!all.length&&!d.paginacao?.temMais)throw err('A série não foi retornada pela API desta base. Confira o cadastro do aparelho e o escopo de acesso.',422);if(d.paginacao?.temMais||all.length>=50||matches.length!==1)throw err('Aparelho único não confirmado na API.',422);const raw=matches[0],id=value(raw,['codEquipamento','idEquipamento','equipment_id','id']);if(!/^\d+$/.test(id)||Number(id)<=0||['I','INATIVO','INACTIVE','0'].includes(value(raw,['status','situacao','ativo']).toUpperCase()))throw err('Aparelho inativo ou sem código confirmado.',422);return{...normalize(raw),id,ok:true,binding_known:Object.hasOwn(raw,'veiculo'),status:value(raw,['ativo','status','situacao']),carrier:value(raw,['nomeOperadora','operadora'])||({1:'Vivo',3:'Claro',4:'Tim',6:'Multioperadora'}[Number(raw.codOperadora)]||''),plate:value(raw.veiculo,['placa']),vehicle_id:value(raw.veiculo,['codVeiculo']),api_version:2};}
 async equipmentPortal(branch,serial){return this.equipment(branch,serial);}
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
