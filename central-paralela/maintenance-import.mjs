import {Buffer} from 'node:buffer';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {trackingDocument} from './drive.mjs';
export function signImport(body,key){return createHmac('sha256',key).update('maintenance-import-v1\n'+body).digest('hex');}
export function verifyImport(body,signature,key,until){if(!key||Date.now()>Number(until)||!Number(until)||!/^[a-f0-9]{64}$/.test(signature||''))return false;return timingSafeEqual(Buffer.from(signImport(body,key),'hex'),Buffer.from(signature,'hex'));}
export function mergeMaintenance(data,branch,records){
 const rows=data.maintenance||[];let added=0,skipped=0;
 for(const source of records){if(source.branch!==branch||!source.id||!Number.isFinite(Date.parse(source.data?.entry)))throw Error('Invalid source identity/date');const id='original:'+source.id,existing=rows.find(r=>r.id===id||r.source?.id===source.id&&r.source?.system==='central-original');if(existing){skipped++;continue;}
 const v=source.data,i=v.incident||{},r=v.resolution||{};
 rows.push({...v,id,version:1,source:{system:'central-original',id:source.id,branch,version:source.version,importedAt:new Date().toISOString()},sourceRecord:source,client:v.client||'',plate:v.plate||'',currentSerial:v.currentSerial||'',entry:v.entry,vehicleType:i.vehicleType||'Não informado',trackerModel:i.trackerModel||'Não informado',trackerVersion:i.trackerVersion||'',carrier:i.carrier||'',chipType:i.chipType||'Não informado',iccid:i.iccid||'',phone:i.phone||'',reason:({'Sem comunicação':'Sem comunicar','Localização errada':'Localização parada'})[v.reason]||v.reason||'Outro',medium:v.medium==='Consultor informou'?'Voluntário':v.medium||'Suporte do rastreio',cause:v.cause||'Não identificada',solutionKind:r.kind||(v.installSerial?'Troca de aparelho':'Não informada'),observation:Object.hasOwn(v,'observation')?v.observation:[...new Set([v.notes,v.diagnosis,r.notes||v.solution].filter(Boolean))].join('\n\n')});added++;}
 if(rows.length>10000)throw Error('Maintenance limit');data.maintenance=rows;return {added,skipped,total:rows.length};
}
export async function importMaintenance(input,config){const doc=await trackingDocument(config,input.branch);if(input.action==='verify'){return {records:(doc.data.maintenance||[]).filter(r=>r.source?.system==='central-original').map(r=>r.sourceRecord)};}const result=mergeMaintenance(doc.data,input.branch,input.records||[]);if(result.added)await doc.save();return result;}
