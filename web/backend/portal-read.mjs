import {ORIGINS,table,plain,normalize,value,serialOf} from './integrations.mjs';
const fail=(message,status=422)=>Object.assign(Error(message),{status});
const compact=s=>String(s||'').replace(/[\s-]/g,'').toUpperCase();
const numeric=s=>/^[1-9]\d*$/.test(String(s));
const serialCheck=s=>{if(!/^\d{6,17}$/.test(s||''))throw fail('Informe a série exata.',400);};
const stamp=s=>String(s||'').replace(/^(\d{2})\/(\d{2})\/(\d{4})\s/,'$3-$2-$1T');
function attr(tag,key){return tag.match(new RegExp('\\b'+key+'=["\']([^"\']*)["\']','i'))?.[1]||'';}
export function formField(html,name){
 for(const m of html.matchAll(/<input\b[^>]*>/gi))if(attr(m[0],'name')===name)return {value:plain(attr(m[0],'value')),text:''};
 for(const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi))if(attr(m[1],'name')===name){const selected=[...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].filter(o=>/\bselected\b/i.test(o[1]));if(selected.length===1)return{value:plain(attr(selected[0][1],'value')),text:plain(selected[0][2])};}
 return {value:'',text:''};
}
export function portalVehicles(html){
 if(!/<th[^>]*>\s*PLACA\s*<\/th>/i.test(html)||!html.includes('veiculos'))throw fail('Formato de veículos web não confirmado.');
 return table(html).filter(r=>r.cells.length>=8).map(({cells:c,html:h})=>({plate:c[0],model:c[1],serial:/^\d{6,17}$/.test(c[4])?c[4]:'',client:c[5],vehicle_id:h.match(/veiculos_editar\.php\?id=(\d+)/)?.[1]||'',status:c[6]}));
}
export function activeFleetTotal(html){
 const matches=[...html.matchAll(/<h5\b[^>]*>\s*Ve[ií]culos\s*<\/h5>\s*<p\b[^>]*>\s*([\d.]+)\s*<\/p>\s*<small\b[^>]*>\s*Ativos na frota\s*<\/small>/gi)];
 if(matches.length!==1)throw fail('Total de veículos ativos não confirmado.');
 const total=Number(matches[0][1].replaceAll('.',''));
 if(!Number.isSafeInteger(total)||total<0)throw fail('Total de veículos ativos inválido.');
 return total;
}
export class PortalRead{
 constructor(api){this.api=api;this.sessions=api.portalSessions||new Map();}
 async request(branch,path,fields){
  if(!ORIGINS[branch]||!path.startsWith('/')||path.startsWith('//')||(!fields&&!/^\/(?:cadastro\/(?:veiculos_listar|equipamentos_listar|equipamentos_editar)\.php|get_data\.php|get_eventos\.php|get_bateria\.php|get_veiculos_intervalo\.php|home_adm\.php)/.test(path))||(fields&&path!=='/login.php'))throw fail('Rota web de consulta não autorizada.',400);
  const s=this.sessions.get(branch),r=await this.api.request(ORIGINS[branch]+path,{method:fields?'POST':'GET',allowRedirect:!!fields,headers:{Cookie:[...s.cookies].map(([k,v])=>k+'='+v).join('; '),...(fields?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:fields?new URLSearchParams(fields).toString():undefined});
  for(const v of r.headers.getSetCookie()){const p=v.split(';')[0],i=p.indexOf('=');if(i>0)s.cookies.set(p.slice(0,i),p.slice(i+1));}return r.text;
 }
 async page(branch,path,retry=true){
  let s=this.sessions.get(branch);if(!s||Date.now()-s.at>900000){s={cookies:new Map(),at:Date.now(),ready:false};this.sessions.set(branch,s);}
  if(!s.ready){if(!s.login)s.login=(async()=>{const c=this.api.credentials(branch);await this.request(branch,'/login.php',{usuario:c.username,senha:c.password});s.ready=true;s.generation=(s.generation||0)+1;})().finally(()=>{s.login=null;});await s.login;}
  const generation=s.generation,html=await this.request(branch,path);
  if(/(?:<form[^>]*(?:loginForm|login\.php)|<title>\s*GRUPO RS\s*<\/title>)/i.test(html)){if(s.generation===generation)s.ready=false;if(retry)return this.page(branch,path,false);throw fail('Sessão web recusada nesta base.',502);}return html;
 }
 async json(branch,path){let data;try{data=JSON.parse(await this.page(branch,path));}catch(e){if(e.status)throw e;throw fail('Resposta web inválida.',502);}if(data?.error||data?.erro||data?.success===false)throw fail('Consulta web recusada.',502);return data;}
 meta(branch){return{source:ORIGINS[branch],data_source:'web',queried_at:new Date().toISOString()};}
 async vehicles(branch,serial){serialCheck(serial);const html=await this.page(branch,'/cadastro/veiculos_listar.php?'+new URLSearchParams({busca:serial,status:'Todos'}));if(/Pagina\s+\d+\s+de\s+(?:[2-9]|\d{2,})/i.test(plain(html)))throw fail('Lista web incompleta. Refine a série.');return portalVehicles(html).filter(r=>r.serial===serial).map(r=>({...r,...this.meta(branch)}));}
 async vehiclesByPlate(branch,plate){
  if(!/^[A-Z0-9]{3,12}$/.test(compact(plate)))throw fail('Placa inválida para consulta web.',400);
  const html=await this.page(branch,'/cadastro/veiculos_listar.php?'+new URLSearchParams({busca:plate,status:'Todos'}));
  if(/Pagina\s+\d+\s+de\s+(?:[2-9]|\d{2,})/i.test(plain(html)))throw fail('Lista web incompleta. Placa única não confirmada.');
  return portalVehicles(html).filter(r=>compact(r.plate)===compact(plate)).map(r=>({...r,...this.meta(branch)}));
 }
 async lookupEquipment(branch,q){
  if(typeof q!=='string'||q.length<3||q.length>80)throw fail('Busca inválida.',400);
  if(/^\d{9}$/.test(q))return this.equipment(branch,q);
  const identification=/^(?:(XRS|GRS|AAA)[ -]*\d+|[A-Z]{3}[ -]*\d[A-Z0-9]\d{2})$/i.test(q),key=v=>String(v||'').replace(/[ -]/g,'').toUpperCase();
  const html=await this.page(branch,'/cadastro/'+(identification?'veiculos':'equipamentos')+'_listar.php?'+new URLSearchParams({busca:q,status:'Todos'}));
  if(/Pagina\s+\d+\s+de\s+(?:[2-9]|\d{2,})/i.test(plain(html)))throw fail('Lista web incompleta. Refine a busca.');
  const matches=identification?portalVehicles(html).filter(r=>key(r.plate)===key(q)):table(html).filter(r=>r.cells.some(v=>key(v)===key(q))).map(r=>({serial:r.cells[0]}));
  if(matches.length!==1||!matches[0].serial)throw fail('Correspondência única não confirmada na web. Informe a série.');
  const result=await this.equipment(branch,matches[0].serial);
  if(![result.serial,result.iccid,result.phone,result.plate].some(v=>v&&key(v)===key(q)))throw fail('Identidade divergente no cadastro web.');
  return result;
 }
 async equipment(branch,serial){
  serialCheck(serial);const html=await this.page(branch,'/cadastro/equipamentos_listar.php?'+new URLSearchParams({busca:serial,status:'todos'}));
  const found=table(html).filter(r=>r.cells.length>=8&&r.cells[0]===serial);if(found.length!==1)throw fail('Aparelho único não confirmado na web.');
  const r=found[0],id=r.html.match(/equipamentos_editar\.php\?id=(\d+)/)?.[1];if(!numeric(id))throw fail('Código do aparelho não confirmado na web.');
  const detail=await this.page(branch,'/cadastro/equipamentos_editar.php?id='+id),f=n=>formField(detail,n);
  if(f('NumeroSerie').value!==serial||f('CodEquipamento').value!==id)throw fail('Identidade divergente no cadastro web.');
  return{ok:true,id,serial,model:r.cells[1],plate:r.cells[2],client:r.cells[3],iccid:f('NumeroChip').value,phone:f('NumeroTelefone').value,apn:f('Apn').value,carrier:f('CodOperadora').text,status:r.cells[6],...this.meta(branch)};
 }
 async clients(branch,q,mode='name'){
  if(typeof q!=='string'||q.trim().length<3||q.length>120)throw fail('Informe ao menos três caracteres.',400);
  if(mode==='vehicle'){const html=await this.page(branch,'/cadastro/veiculos_listar.php?'+new URLSearchParams({busca:q,status:'Todos'}));const vs=portalVehicles(html);if(/Pagina\s+\d+\s+de\s+(?:[2-9]|\d{2,})/i.test(plain(html)))throw fail('Lista web incompleta. Refine a busca.');const out=new Map();for(const v of vs){if(!v.client)throw fail('Titular não informado na web.');const names=await this.clients(branch,v.client,'name');const exact=names.filter(x=>x.name===v.client);if(exact.length!==1)throw fail('Titular web ambíguo.');out.set(exact[0].id,exact[0]);}return [...out.values()];}
  const d=await this.json(branch,'/get_data.php?'+new URLSearchParams({acao:'clientes_select2',term:q.trim(),page:'1'}));if(!Array.isArray(d.items)||d.more)throw fail('Lista web incompleta. Refine o nome.');return d.items.map(r=>{if(!numeric(r.id)||!r.text)throw fail('Titular inválido na web.');return{id:String(r.id),name:String(r.text).trim()};});
 }
 async clientVehicles(branch,id,name){
  if(!numeric(id)||!name)throw fail('Selecione um titular válido.');const d=await this.json(branch,'/get_data.php?'+new URLSearchParams({acao:'veiculos',cliente:id,placa:'todos',mapa_rapido:'1',leve:'1',tela:'localizacao',ultima_posicao:'1'}));if(!Array.isArray(d))throw fail('Veículos web não confirmados.');
  // Additional client access is not evidence of vehicle ownership.
  return d.map(r=>({...normalize(r),serial:serialOf(r)||value(r,['equipamento','imei']),client:value(r,['NomeClienteTitular']),client_id:value(r,['CodClienteTitular']),model:value(r,['modelo'])})).filter(r=>r.client_id===String(id)&&r.client===name);
 }
 async location(branch,serial){
  const vs=await this.vehicles(branch,serial);if(vs.length!==1||!vs[0].client)throw fail('Vínculo e titular web não confirmados.');const v=vs[0],cs=(await this.clients(branch,v.client)).filter(c=>c.name===v.client);if(!cs.length||cs.length>5)throw fail('Titular web ambíguo.');
  const found=[];
  for(const c of cs){const d=await this.json(branch,'/get_data.php?'+new URLSearchParams({acao:'veiculos',cliente:c.id,placa:v.plate,mapa_rapido:'1',leve:'1',tela:'localizacao',ultima_posicao:'1'}));if(!Array.isArray(d))throw fail('Comunicação web inválida.');found.push(...d.filter(r=>value(r,['CodVeiculo','id'])===v.vehicle_id&&(serialOf(r)||value(r,['equipamento']))===serial&&compact(value(r,['placa']))===compact(v.plate)&&value(r,['CodClienteTitular'])===c.id&&value(r,['NomeClienteTitular'])===v.client));}
  if(found.length!==1)throw fail('Comunicação web não confirmou o vínculo exato.');
  const r=found[0],n=normalize(r);let batteryWarning="";if(!n.battery)try{const d=await this.json(branch,"/get_bateria.php?"+new URLSearchParams({cliente:value(r,["CodClienteTitular"])}));if(!Array.isArray(d.veiculos))throw fail("Bateria web não confirmada.");const bs=d.veiculos.filter(b=>value(b,["CodVeiculo","id"])===v.vehicle_id&&compact(value(b,["placa"]))===compact(v.plate));if(bs.length!==1)throw fail("Bateria sem veículo confirmado.");n.battery=value(bs[0],["bateria"]);}catch(e){batteryWarning=e.message;}return{...n,source_warning:batteryWarning,ok:true,serial,plate:v.plate,vehicle_id:v.vehicle_id,client:v.client,client_id:value(r,['CodClienteTitular']),equipment_id:value(r,['CodEquipamento']),updated_at:stamp(value(r,['DataComunicacaoServidor','DataComunicacao','UltimaComunicacao'])),gps_at:stamp(n.gps_at),...this.meta(branch)};
 }
 async history(branch,serial,start,end){
  if(![start,end].every(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(v))||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<Date.parse(start)||Date.parse(end)-Date.parse(start)>7*86400000)throw fail('Informe período válido de até sete dias.',400);
  const context=await this.location(branch,serial),d=await this.json(branch,'/get_eventos.php?'+new URLSearchParams({cliente:context.client_id,veiculo:context.vehicle_id,inicio:start,fim:end}));
  if(!Array.isArray(d.eventos))throw fail('Histórico web não confirmado.');
  return{ok:true,rows:d.eventos.map(r=>{const n=normalize(r);if(value(r,['CodVeiculo','veiculo_id'])&&value(r,['CodVeiculo','veiculo_id'])!==context.vehicle_id)throw fail('Histórico de outro veículo.');return{id:value(r,['id','codPosicao']),gps_at:stamp(n.gps_at),server_at:stamp(n.updated_at),lat:n.lat,lng:n.lng,speed:n.speed,ignition:n.ignition,battery:n.battery,memory:false};}),partial:true,distance:null,context,message:'A web não informa garantia de completude do histórico.',...this.meta(branch)};
 }
 async maintenance(branch){const html=await this.page(branch,'/get_veiculos_intervalo.php?intervalo=Manutencao'),expected=plain(html).match(/Ve[ií]culos\s*\(\s*([\d.]+)\s*\)/i);if(!expected)throw fail('Total de manutenção web não confirmado.');const rows=table(html).filter(r=>r.cells.length>=6).map(({cells:c})=>({client:c[0],plate:c[1],serial:c[2],apn:c[3],phone:c[4],updated_at:c[5],branch}));if(rows.length!==Number(expected[1].replaceAll('.','')))throw fail('Lista de manutenção web incompleta.');let fleet_total=null,fleet_warning='';try{fleet_total=activeFleetTotal(await this.page(branch,'/home_adm.php'));}catch(e){fleet_warning=e.message;}return{rows,count:rows.length,fleet_total,fleet_warning,...this.meta(branch)};}
}
