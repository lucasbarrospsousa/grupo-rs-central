// Ignition describes the last reported position, never freshness or chip status.
export function ignitionState(value){
 const v=String(value??'').trim().toLowerCase();
 if(['1','true','on','ligado','ligada'].includes(v))return 'on';
 if(['0','false','off','desligado','desligada'].includes(v))return 'off';
 return 'unknown';
}
export const ignitionLabels={on:'Ligada',off:'Desligada',unknown:'Não informada'};
export function ignitionRows(rows,filter=''){return filter?rows.filter(r=>ignitionState(r.ignition)===filter):rows;}
export function ignitionCounts(rows){return rows.reduce((out,r)=>{out[ignitionState(r.ignition)]++;return out;},{on:0,off:0,unknown:0});}
