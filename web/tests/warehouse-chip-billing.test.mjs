import test from 'node:test';
import assert from 'node:assert/strict';
import {billingGroups,filterBilling} from '../public/warehouse-chip-billing.js';
import {cachedWarehouseCosts,loadWarehouseCosts} from '../public/warehouse-cost-cache.js';
test('Billing groups by provider, operator, APN and price; search covers device and plate',()=>{
 const items=[{iccid:'89',provider:'arya',operator:'TIM',apn:'hinova.br',cents:399,state:'Confirmado',devices:['01'],associations:[{plate:'ABC1D23'}]},{iccid:'90',provider:'arya',operator:'TIM',apn:'outro.br',cents:399,state:'Confirmado'},{iccid:'91',provider:'link',operator:'TIM',apn:'hinova.br',cents:null,state:'Não ativo'}];
 const groups=billingGroups(items);assert.equal(groups.length,2);assert.equal(groups.reduce((n,g)=>n+g.count*g.cents,0),798);
 assert.equal(filterBilling(items,{group:groups[0].key}).length,1);assert.equal(filterBilling(items,{query:'abc1d23'})[0].iccid,'89');assert.equal(filterBilling(items,{query:'01'}).length,1);assert.equal(filterBilling(items,{state:'pending'})[0].iccid,'91');
});
test('Overview and Chips share one saved-value GET; cached browsing never refreshes providers',async()=>{
 let calls=0,finish;const repo={real:true,user:{username:'one',permissions:{owner:true}},request:async(path,options)=>{calls++;assert.deepEqual(options,{});await new Promise(r=>finish=r);return {ok:true,items:[]};}};
 const first=loadWarehouseCosts(repo),second=loadWarehouseCosts(repo);finish();await Promise.all([first,second]);await loadWarehouseCosts(repo);assert.equal(calls,1);assert.ok(cachedWarehouseCosts(repo));repo.user.username='two';assert.equal(cachedWarehouseCosts(repo),null);repo.user.permissions.owner=false;assert.equal(await loadWarehouseCosts(repo),null);
});
