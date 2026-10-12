import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmedOwner,stockOwner} from '../backend/stock-owner.mjs';
const equipment={ok:true,serial:'024000001',id:'2',vehicle_id:'3',plate:'ABC-1234'};
const vehicle={serial:equipment.serial,equipment_id:'2',vehicle_id:'3',plate:'ABC1234',client_id:'4',client:'José Silva'};
test('owner requires exact equipment, vehicle and unique holder; names alone never establish a link',()=>{
 assert.equal(confirmedOwner('imperatriz',equipment.serial,equipment,vehicle).client_id,'4');
 for(const patch of [{serial:'024000002'},{vehicle_id:'9'},{equipment_id:'8'},{plate:'XYZ1234'},{client_id:''},{owner_count:2},{client:''}])assert.equal(confirmedOwner('imperatriz',equipment.serial,equipment,{...vehicle,...patch}),null);
});
test('cache is branch and binding specific; no API call while current',async()=>{
 const owner=confirmedOwner('imperatriz',equipment.serial,equipment,vehicle);
 const pool={query:async()=>({rows:[{data:{owner,plate:vehicle.plate,vehicle_id:'3',equipment_id:'2'}}]})};
 assert.equal((await stockOwner(pool,{},'imperatriz',equipment.serial)).cached,true);
});
test('not installed: never reads upstream or writes the stock item',async()=>{
 let calls=0;const pool={query:async()=>{calls++;return{rows:[{data:null}]};}};
 assert.equal((await stockOwner(pool,{},'imperatriz',equipment.serial)).ok,false);assert.equal(calls,1);
});
test('swap race refuses stale owner and API failure clears confirmation',async()=>{
 for(const fails of [false,true]){let saved;
  const pool={query:async(sql,args)=>sql.includes('owner_context')?{rows:[{data:{version:1,plate:vehicle.plate}}]}:(saved=args[3],{rows:[{saved:false}]})};
  const service={equipment:async()=>equipment,vehicles:async()=>{if(fails)throw Error('offline');return[vehicle];}};
  assert.equal((await stockOwner(pool,service,'imperatriz',equipment.serial)).ok,false);
  assert.equal(saved===null,fails);
 }
});


import {filterStock} from '../public/stock-model.js';
test('accent-insensitive local owner search ignores stale, swapped or other-base identities',()=>{
 const owner=confirmedOwner('imperatriz',equipment.serial,equipment,vehicle);
 const row={serial:equipment.serial,status:'Instalado',plate:vehicle.plate,owner_binding:owner};
 assert.equal(filterStock([row],{query:'jose silva'}).rows.length,1);
 for(const changed of [{plate:'XYZ1234'},{status:'Estoque'},{owner_binding:{...owner,branch:'maraba'}},{owner_binding:{...owner,checked_at:'2000-01-01'}}])assert.equal(filterStock([{...row,...changed}],{query:'jose'}).rows.length,0);
});
