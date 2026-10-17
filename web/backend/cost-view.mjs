import {createHash} from 'node:crypto';
import {billingGroups,operatorGroups,filterBilling} from '../public/warehouse-chip-billing.js';
export function costView(data,p){
 const {items=[],inventory_items=[],...summary}=data,view=p.get('view'),page=Number(p.get('page')||0);
 if(!Number.isSafeInteger(page)||page<0)throw Object.assign(Error('Página inválida.'),{status:400});
 let result={...summary,items:[],inventory_items:[]};
 if(view==='page'){
  const list=filterBilling(items,{query:p.get('query')||'',group:p.get('group')||'',state:p.get('state')||''}),current=Math.min(page,Math.max(0,Math.ceil(list.length/12)-1));
  result={...result,items:list.slice(current*12,current*12+12),total:list.length,page:current,operators:operatorGroups(billingGroups(items))};
 }else if(view==='prices'){
  const ids=(p.get('iccids')||'').split(',');if(ids.length>20)throw Object.assign(Error('Até 20 chips.'),{status:400});result={...result,items:items.filter(r=>ids.includes(r.iccid)),inventory_items:inventory_items.filter(r=>ids.includes(r.iccid))};
 }else if(view!=='summary')throw Object.assign(Error('Visão inválida.'),{status:400});
 // Invoice itemization is needed only for the chips in the visible page.
 if(result.billing)result.billing={...result.billing,invoices:(result.billing.invoices||[]).map(i=>({...i,...(i.items?{items:i.items.filter(r=>result.items.some(x=>x.iccid===r.iccid))}:{})}))};
 const cursor=createHash('sha256').update(JSON.stringify(result)).digest('hex');return p.get('since')===cursor?{cursor,unchanged:true}:{...result,cursor};
}
