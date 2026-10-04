import {communication} from './stock-live.js';
export function monitorDate(value,missing='Não informado'){
 if(!value)return missing;
 const text=String(value).trim().replace(' ','T');
 const local=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text);
 const at=new Date(local?text+'-03:00':text);
 return Number.isFinite(at.getTime())?at.toLocaleString('pt-BR',{timeZone:'America/Fortaleza'}):missing;
}
export const basePlatforms={imperatriz:'https://imp.ogrupors.com.br/',araguaina:'https://arg.ogrupors.com.br/',acailandia:'https://acl.ogrupors.com.br/',maraba:'https://mab.ogrupors.com.br/'};
export const monitorLabels={on:'Ligados',off:'Desligados',stale:'Desatualizados',unknown:'Não verificados',gps:'Possível GPS'};
export function monitorState(row,now=Date.now()){
 const status=communication(row.observation?.location,now);
 return status==='Atualizado'?'on':status==='Desligado'?'off':status==='Desatualizado'?'stale':status==='Possível GPS'?'gps':'unknown';
}
export function monitorCounts(rows,now=Date.now()){const counts={on:0,off:0,stale:0,unknown:0,gps:0};for(const row of rows)counts[monitorState(row,now)]++;return counts;}
