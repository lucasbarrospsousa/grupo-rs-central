import {warehouseDay,warehouseDestination} from './warehouse-model.js';
export function filterWarehouseMovements(events,rows,{month='',destination='',scope='shipments',query=''}={}){
 const kinds=new Map(rows.map(r=>[r.serial,r.kind])),q=query.trim().toLocaleLowerCase('pt-BR');
 return events.filter(m=>{
  const kind=m.kind||kinds.get(m.serial),sent=['Envio','Enviado'].includes(m.type)&&!m.detected;
  return (!month||warehouseDay(m.atISO).slice(0,7)===month)&&(!destination||(destination.startsWith('custom:')?String(m.destination||'')===destination.slice(7):warehouseDestination(m.destination)===destination))&&
   (scope==='all'||scope==='chips'&&kind==='chip'||scope==='devices'&&kind==='device'||scope==='shipments'&&kind==='device'&&sent)&&
   [m.serial,m.type,m.destination,m.branch,m.note,m.deviceSerial].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(q));
 }).sort((a,b)=>(Date.parse(b.atISO)||0)-(Date.parse(a.atISO)||0));
}
