export const symptoms=['Sem comunicar','Ignição travada','Localização parada','Outro'];
export const sources=['Voluntário','App de rastreamento','Suporte do rastreio'];
export const solutions=['Troca de chip + reconfiguração','Troca de aparelho','Troca de aparelho e chip + reconfiguração','Ajuste de instalação','Outra solução','Não informada'];
export const causes=['Falha do chip','Falha de cobertura/rede','Travamento','Falha de GPS','Infiltração / aparelho molhado','Curto interno','Falha de alimentação/instalação','Outra causa','Não identificada'];
export const trackerModels=['RS300','Suntech 2G','J16 2G/4G','Outro','Não informado'];
export const rsVersions=['7.1.6','7.2.2','7.3.2','7.3.5'];
export const vehicleTypes=['Motocicleta','Automóvel','Utilitário','Caminhão','Ônibus','Outro','Não informado'];
export const chipTypes=['Comum','Multioperadora','Não informado'];
export const missing='Não informado';
export const clean=v=>String(v??'').trim();
export function normalizedSymptom(v){return ({'Sem comunicação':'Sem comunicar','Localização errada':'Localização parada'})[v]||v||missing;}
export function normalizedSource(v){return v==='Consultor informou'?'Voluntário':v||missing;}
export function recordView(row){
 const incident=row.incident||{},resolution=row.resolution||{};
 return {...row,reason:normalizedSymptom(row.reason),medium:normalizedSource(row.medium),incident,resolution,cause:row.cause||'Não identificada',diagnosis:row.diagnosis||'',solutionKind:resolution.kind|| (row.installSerial?'Troca de aparelho':'Não informada'),solutionNotes:resolution.notes||row.solution||'',installSerial:Object.hasOwn(resolution,'serial')?resolution.serial:(row.installSerial||'')};
}
// Never infer a historical firmware version from today's stock or an ambiguous prefix.
export function exactRsVersion(incident){return incident?.trackerModel==='RS300'&&/^\d+\.\d+\.\d+$/.test(incident.trackerVersion||'')?incident.trackerVersion:null;}
export function localVisitDay(value){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(d):String(value||'').slice(0,10);}
export function recordRows(rows,{search='',month='',model=''}={}){const q=clean(search).toLocaleLowerCase('pt-BR');return rows.map(recordView).filter(r=>(!month||localVisitDay(r.entry).startsWith(month))&&(!model||r.incident.trackerModel===model)&&(!q||[r.client,r.plate,r.currentSerial,r.installSerial,r.reason,r.cause,r.diagnosis,r.notes,r.solutionNotes].some(v=>clean(v).toLocaleLowerCase('pt-BR').includes(q))));}
const counts=(rows,fn)=>{const out=new Map();for(const row of rows){const key=fn(row)||missing;out.set(key,(out.get(key)||0)+1);}return [...out].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'pt-BR'));};
export function recordIndicators(rows){
 const serials=counts(rows,r=>r.currentSerial),rs=rows.filter(r=>r.incident.trackerModel==='RS300');
 const versions=counts(rs,r=>exactRsVersion(r.incident));
 return {total:rows.length,devices:serials.length,returns:serials.filter(r=>r.count>1).length,symptoms:counts(rows,r=>r.reason),versions,vehicles:counts(rows,r=>r.incident.vehicleType),solutions:counts(rows,r=>r.solutionKind),sources:counts(rows,r=>r.medium),rsTotal:rs.length};
}
