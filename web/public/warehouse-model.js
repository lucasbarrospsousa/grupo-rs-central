export const warehouseBases=[['imperatriz','Imperatriz','#1686ed'],['araguaina','Araguaína','#009f91'],['acailandia','Açailândia','#8a59ce'],['maraba','Marabá','#ee8a12']];
export const warehouseLabel=id=>warehouseBases.find(b=>b[0]===id)?.[1]||id||'Não informado';
export function warehouseDestination(value){const key=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(' • ')[0].trim();return warehouseBases.some(b=>b[0]===key)?key:'';}
export function warehouseDay(value){const date=new Date(value);return Number.isNaN(+date)?'':new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
// One item arriving in a destination counts once, not once for dispatch and again for detection.
export function warehouseDepartures(rows,movements){
 const known=new Map(rows.map(r=>[r.serial,r])),seen=new Set();
 return [...movements].filter(m=>known.has(m.serial)&&['Envio','Utilizado','Enviado'].includes(m.type)&&m.atISO&&warehouseDay(m.atISO)&&warehouseDestination(m.destination)).sort((a,b)=>new Date(a.atISO)-new Date(b.atISO)).filter(m=>{const key=m.serial+'|'+warehouseDestination(m.destination);if(seen.has(key))return false;seen.add(key);return true;}).map(m=>({...m,kind:m.kind||known.get(m.serial).kind,destinationBase:warehouseDestination(m.destination)}));
}
export function warehouseSummary(rows,movements,now=new Date()){
 const available=rows.filter(r=>r.status==='Disponível'),stock=available.filter(r=>(r.classification||'Estoque')==='Estoque');
 return[stock.filter(r=>r.kind==='device').length,stock.filter(r=>r.kind==='chip').length,available.filter(r=>r.classification==='Reserva').length,available.filter(r=>r.classification==='Emergência').length,warehouseDepartures(rows,movements).filter(m=>warehouseDay(m.atISO)===warehouseDay(now)).length];
}
export function warehouseSeries(rows,movements,{month=warehouseDay(new Date()).slice(0,7),months=1,kind='',now=new Date()}={}){
 const [y,m]=month.split('-').map(Number);if(!y||m<1||m>12)throw Error('Mês inválido');
 const start=new Date(Date.UTC(y,m-months,1)),end=new Date(Date.UTC(y,m,0)),today=warehouseDay(now),dates=[];
 for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1)){const key=d.toISOString().slice(0,10);if(key<=today)dates.push(key);}
 const events=warehouseDepartures(rows,movements).filter(e=>(!kind||e.kind===kind)&&dates.includes(warehouseDay(e.atISO)));
 return{dates,events,lines:warehouseBases.map(([id,name,color])=>({id,name,color,values:dates.map(day=>events.filter(e=>e.destinationBase===id&&warehouseDay(e.atISO)===day).length)}))};
}
