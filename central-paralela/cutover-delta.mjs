import {digest} from './auth-crypto.mjs';
const fail=()=>{throw Object.assign(Error('Delta conflict; no changes applied'),{status:409});};
const allowed={devices:new Set(['owner_binding','sourceRecord','version']),warehouse:new Set(['chip_monitor_due','chip_monitor_result','chip_status','checked_at','sourceRecord','version']),costs:null};
export function applyDelta(data,input){
 if(input.branch!==data.branch.id||!Array.isArray(input.patches)||input.patches.length>50)fail();
 const changes=[];for(const p of input.patches){
  if(!Object.hasOwn(allowed,p.section)||typeof p.key!=='string')fail();
  const rows=p.section==='devices'?data.rows:p.section==='warehouse'?data.warehouse?.rows:null;
  const target=p.section==='costs'?data.warehouse:rows?.find(r=>r.id===p.id);
  if(!target||(p.section==='costs'?p.key!=='costs':!allowed[p.section].has(p.key)))fail();
  const value=Object.hasOwn(target,p.key)?target[p.key]:null;
  if(digest(JSON.stringify(value))===p.afterHash)continue;
  if(digest(JSON.stringify(value))!==p.beforeHash||digest(JSON.stringify(p.value))!==p.afterHash)fail();
  changes.push({target,p});
 }
 for(const {target,p} of changes)target[p.key]=p.value;
 return{ok:true,changed:changes.length};
}
