import {warehouseDay,warehouseDestination,warehouseLabel} from './warehouse-model.js';
export function overviewData(rows,movements,month,now=new Date()){
 const today=warehouseDay(now),known=new Map(rows.map(r=>[r.serial,r])),seen=new Set();
 const events=[...movements].filter(m=>['Envio','Enviado','Utilizado'].includes(m.type)&&warehouseDay(m.atISO)&&warehouseDay(m.atISO)<=today).sort((a,b)=>new Date(a.atISO)-new Date(b.atISO)).filter(m=>{
  const destination=warehouseDestination(m.destination)||String(m.destination||'').trim().toLowerCase();
  const key=m.serial+'|'+destination;if(seen.has(key))return false;seen.add(key);return true;
 }).map(m=>({...m,kind:m.kind||known.get(m.serial)?.kind,destinationName:warehouseLabel(warehouseDestination(m.destination)||m.destination)}));
 const selected=events.filter(m=>warehouseDay(m.atISO).startsWith(month)),devices=selected.filter(m=>m.kind==='device');
 const available=rows.filter(r=>r.status==='Disponível'),chips=available.filter(r=>r.kind==='chip');
 const activated=rows.filter(r=>r.kind==='chip'&&r.activation_state==='active'&&warehouseDay(r.activation_at).startsWith(month));
 const pending=rows.filter(r=>r.kind==='chip'&&['requested','sending','uncertain'].includes(r.activation_state));
 const destinations=[...new Set(devices.map(m=>m.destinationName))].map(name=>({name,count:devices.filter(m=>m.destinationName===name).length})).sort((a,b)=>b.count-a.count);
 const batches=new Map();for(const m of [...selected].sort((a,b)=>new Date(b.atISO)-new Date(a.atISO))){const key=[m.id,m.kind,m.destinationName,m.detected].join('|');const batch=batches.get(key)||{...m,count:0};batch.count++;batches.set(key,batch);}
 const [year,number]=month.split('-').map(Number),days=new Date(Date.UTC(year,number,0)).getUTCDate();
 return {available:available.filter(r=>r.kind==='device'&&(r.classification||'Estoque')==='Estoque').length,chipTotal:chips.length,chipCounts:['Estoque','Reserva','Emergência'].map(name=>({name,count:chips.filter(r=>(r.classification||'Estoque')===name).length})),sent:devices.length,activated:activated.length,pending:pending.length,destinations,batches:[...batches.values()],daily:Array.from({length:days},(_,i)=>({day:i+1,key:month+'-'+String(i+1).padStart(2,'0')})).filter(d=>d.key<=today).map(d=>({...d,counts:destinations.map(dest=>devices.filter(m=>m.destinationName===dest.name&&warehouseDay(m.atISO)===d.key).length)}))};
}
