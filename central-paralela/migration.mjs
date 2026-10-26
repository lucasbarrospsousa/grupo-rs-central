import {digest} from './auth-crypto.mjs';
import {trackingDocument} from './drive.mjs';
const fail=m=>{throw Object.assign(Error(m),{status:409});};
// Explicit import only. Existing operational records always win.
export function mergeMigration(data,input){
 const {branch,section,records}=input;
 if(data.branch.id!==branch||!['devices','warehouse','movements','costs'].includes(section)||!Array.isArray(records)||records.length>50)fail('Invalid migration batch');
 data.migration??={receipts:{}};let added=0,skipped=0;
 const receipts=data.migration.receipts;
 for(const source of records){
  if(!source.id||source.branch!==branch)fail('Invalid source identity');
  const key=section+':'+source.id,hash=digest(JSON.stringify(source));
  if(receipts[key]){if(receipts[key]!==hash)fail('Source changed; review required');skipped++;continue;}
  data.warehouse??={rows:[],movements:[],audit:[]};
  if(section==='devices'){
   const existing=data.rows.find(r=>r.id===source.id||r.serial===source.value.serial);
   if(existing){existing.sourceRecord??=source.original;for(const [k,v] of Object.entries(source.value))if(existing[k]==null||existing[k]==='')existing[k]=v;skipped++;}
   else{data.rows.push({...source.value,id:source.id,version:source.value.version||1,sourceRecord:source.original});added++;}
  }else if(section==='costs'){
   if(!data.warehouse.costs){data.warehouse.costs=source.value;added++;}else skipped++;
  }else{
   const rows=section==='warehouse'?data.warehouse.rows:data.warehouse.movements;
   if(rows.some(r=>r.id===source.id)){skipped++;}else{rows.push({...source.value,id:source.id,sourceRecord:source.original});added++;}
  }
  receipts[key]=hash;
 }
 return {added,skipped,receipts:records.map(r=>({id:r.id,hash:receipts[section+':'+r.id]}))};
}
export async function importMigration(input,config){const doc=await trackingDocument(config,input.branch);if(input.action==='migration-verify')return {receipts:doc.data.migration?.receipts||{}};const result=mergeMigration(doc.data,input);await doc.save();return result;}
