import test from 'node:test';import assert from 'node:assert/strict';
import {consumeConfiguredChip} from '../backend/configurator-warehouse.mjs';
test('used warehouse chip follows confirmed destination once and retains movement history',async()=>{
 const item={id:'synthetic',branch_id:'acailandia',status:'Utilizado',version:1,usage_device_serial:'123456789',usage_branch:'acailandia'};let writes=0,movements=0,conflict=false;
 const c={query:async(sql,args)=>{
  if(sql.startsWith('select id'))return {rows:[item]};
  if(sql.startsWith('select serial'))return {rows:[{serial:conflict?'987654321':'123456789',branch_id:'imperatriz'}]};
  if(sql.startsWith('update')){writes++;item.usage_device_serial=args[1];item.usage_branch=args[2];}
  if(sql.includes('insert into central_homologacao.warehouse_movements'))movements++;
  return {rows:[]};
 }};
 const p={branch:'imperatriz',serial:'123456789',iccid:'89550000000000000000',userId:'synthetic'};
 assert.equal((await consumeConfiguredChip(c,p)).changed,true);assert.equal(item.branch_id,'acailandia');
 assert.equal((await consumeConfiguredChip(c,p)).changed,false);assert.equal(writes,1);assert.equal(movements,1);
 conflict=true;await assert.rejects(consumeConfiguredChip(c,p),e=>e.status===409);assert.equal(writes,1);
});
