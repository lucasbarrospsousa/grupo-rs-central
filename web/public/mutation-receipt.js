export function applyMutationReceipt(repo,changes){
 const {branch}=changes;if(!branch)return;
 if(changes.relatedWarehouse)applyMutationReceipt(repo,changes.relatedWarehouse);
 repo.receiptVersions??=new Map();
 const merge=(group,rows,incoming=[],removed=[])=>{
  const result=[...rows];
  for(const row of [...incoming,...removed.map(r=>({...r,removed:true}))]){
   const key=branch+':'+group+':'+row.id,index=result.findIndex(r=>r.id===row.id&&r.branch===branch);
   const version=Number(row.version),known=Math.max(repo.receiptVersions.get(key)||0,Number(result[index]?.version)||0);
   if(!row.id||!Number.isFinite(version)||version<known)continue;
   if(version===known&&repo.receiptVersions.get(key)===version&&index<0&&!row.removed)continue;
   repo.receiptVersions.set(key,version);
   if(row.removed){if(index>=0)result.splice(index,1);}
   else if(index>=0)result[index]={...result[index],...row,branch};
   else result.unshift({...row,branch});
  }
  return result;
 };
 if(changes.devices||changes.removedDevices)repo.devices=merge('devices',repo.devices,changes.devices,changes.removedDevices);
 if(changes.reports)repo.reports=merge('history',repo.reports,changes.reports);
 if(changes.warehouse||changes.removedWarehouse){
  const cached=repo.warehouseCache.get(branch)||{rows:repo.warehouseBranch===branch?repo.warehouse:[],movements:repo.warehouseBranch===branch?repo.movements:[]};
  const rows=merge('warehouse',cached.rows,(changes.warehouse||[]).map(r=>({...r,received:new Date(r.received_at).toLocaleString('pt-BR')})),changes.removedWarehouse)
   .sort((a,b)=>(Date.parse(b.received_at)||0)-(Date.parse(a.received_at)||0));
  const added=(changes.movements||[]).flatMap(m=>m.items.map(item=>({id:m.id,branch,type:item.action||'Envio',kind:item.kind,serial:item.serial,deviceSerial:item.device_serial||'',phone:item.phone||'',note:m.note||'',detected:item.time_basis==='detection',atISO:item.detected_at||m.created_at,at:new Date(item.detected_at||m.created_at).toLocaleString('pt-BR'),destination:m.destination})));
  const ids=new Set(added.map(m=>m.id)),serials=new Set(added.map(m=>m.serial));
  const movements=[...added,...cached.movements.filter(m=>!ids.has(m.id)&&!(m.id.startsWith('legacy-')&&serials.has(m.serial)))];
  repo.warehouseCache.set(branch,{rows,movements});
  if(!repo.currentBranch||repo.currentBranch===branch){repo.warehouse=rows;repo.movements=movements;repo.warehouseBranch=branch;}
 }
}
