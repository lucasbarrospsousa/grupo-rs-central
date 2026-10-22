const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
export function chartSeries(rows){return rows.map(r=>({at:Date.parse(r.sample.at),internal:valid(r.sample.internal)?Number(r.sample.internal):null,external:valid(r.sample.external)?Number(r.sample.external):null})).filter(r=>Number.isFinite(r.at)).sort((a,b)=>a.at-b.at);}
export function renderBatteryChart(rows){
 const data=chartSeries(rows);if(!data.length)return '<p>Nenhuma leitura salva para este aparelho.</p>';
 const start=data[0].at,end=data.at(-1).at,span=end-start||1,maxV=Math.max(15,Math.ceil(data.reduce((max,d)=>Math.max(max,d.external||0),0)/5)*5),x=t=>70+(end===start?430:(t-start)/span*860),y=(v,max)=>280-v/max*220;
 const date=t=>new Date(t).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'});
 let svg='<svg viewBox="0 0 1000 345" role="img" aria-label="Bateria interna em percentual e tensão externa em volts ao longo do tempo" style="width:100%;min-width:620px"><rect x="70" y="60" width="860" height="220" fill="#f6f9ff"/>';
 for(let i=0;i<=4;i++){const py=y(i*25,100);svg+=`<path d="M70 ${py}H930" stroke="#dce5ef"/><text x="60" y="${py+5}" text-anchor="end" fill="#176fc1">${i*25}%</text><text x="940" y="${py+5}" fill="#b35800">${(maxV*i/4).toFixed(1)} V</text>`;}
 for(const [key,max,color,label,unit] of [['internal',100,'#147de0','Interna','%'],['external',maxV,'#e77b00','Externa','V']]){let path='',previous=null;for(const row of data){const value=row[key];if(value===null){previous=null;continue;}const px=x(row.at),py=y(value,max);path+=(previous!==null&&row.at-previous<=7200000?'L':'M')+px.toFixed(2)+' '+py.toFixed(2)+' ';previous=row.at;}svg+=`<path data-series="${key}" d="${path}" fill="none" stroke="${color}" stroke-width="2"/>`;if(data.length<=500)for(const row of data){if(row[key]===null)continue;svg+=`<circle cx="${x(row.at)}" cy="${y(row[key],max)}" r="3" fill="${color}"><title>${esc(date(row.at)+' · '+label+': '+row[key]+' '+unit)}</title></circle>`;}}
 svg+=`<text x="70" y="320" fill="#51647a">${esc(date(start))}</text><text x="930" y="320" text-anchor="end" fill="#51647a">${esc(date(end))}</text></svg>`;
 return '<p><strong style="color:#147de0">● Interna (%) · eixo esquerdo</strong> &nbsp; <strong style="color:#b35800">● Externa (V) · eixo direito</strong></p><div style="overflow-x:auto">'+svg+'</div><p>'+data.length+' leituras salvas. Horários de Fortaleza. Valores ausentes e intervalos acima de 2 horas interrompem a linha. As escalas são diferentes; as linhas não indicam capacidade real da bateria.</p>';
}

