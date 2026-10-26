import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queryStatus,guardQueries,latestLocation} from './query-flow.mjs';
import {Integrations} from './integrations.mjs';
const serial='024000001',iccid='89123456789012345678';
test('first lookup saves exact codes; next round uses only communication and APN carrier',async()=>{
 let equipment=0;const providers=[],codes=[];
 const service={equipment:async()=>{equipment++;return{ok:true,serial,id:'1',vehicle_id:'2',iccid,apn:'linksolutions.br'};},equipmentLocation:async(b,s,c)=>{codes.push(c);return{ok:true,serial};},carrier:async(p,i)=>{providers.push(p);return{ok:true,iccid:i};}};
 const row={serial};await queryStatus(service,'imperatriz',row);await queryStatus(service,'imperatriz',row);
 assert.equal(equipment,1);assert.deepEqual(providers,['link','link']);assert.equal(codes[1].equipment_id,'1');
});
test('unknown APN never probes carriers; communication failure clears stale codes',async()=>{
 const row={serial,iccid,apn:'unknown',api_codes:{branch:'imperatriz',serial,vehicle_id:'2'}};let calls=0;
 const service={equipment:async()=>{throw Error('unexpected');},equipmentLocation:async()=>{throw Error('wrong binding');},carrier:async()=>{calls++;}};
 const result=await queryStatus(service,'imperatriz',row);assert.equal(calls,0);assert.equal(result.chip.ok,false);assert.equal(row.api_codes,undefined);
});
test('credential refusal survives new service instance, changed credential unblocks, 403 API is route-local',async()=>{
 const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};let password='old',calls=0;
 const make=()=>guardQueries({secrets:()=>({}),credentials:()=>({password}),api:async()=>{calls++;throw Object.assign(Error('invalid'),{credentialInvalid:true});},carrier:async()=>{}},storage);
 await assert.rejects(make().api('imperatriz','/x'));await assert.rejects(make().api('imperatriz','/x'));assert.equal(calls,1);
 password='new';await assert.rejects(make().api('imperatriz','/x'));assert.equal(calls,2);
 const other=guardQueries({secrets:()=>({}),credentials:()=>({password:'third'}),api:async()=>{calls++;throw Object.assign(Error('route denied'),{upstreamStatus:403});},carrier:async()=>{}},storage);
 await assert.rejects(other.api('imperatriz','/x'));await assert.rejects(other.api('imperatriz','/y'));assert.equal(calls,4);
});
test('429 holds provider for 60 seconds without repeating transport',async()=>{
 const map=new Map(),storage={get:async k=>map.get(k),put:async(k,v)=>map.set(k,v)};let calls=0;
 const s=guardQueries({secrets:()=>({}),credentials:()=>({}),api:async()=>{calls++;throw Object.assign(Error('limit'),{status:429});},carrier:async()=>{}},storage);
 await assert.rejects(s.api('imperatriz'));await assert.rejects(s.api('imperatriz'));assert.equal(calls,1);
});
test('older communication and failed queries never overwrite valid observations',()=>{
 const old={ok:true,serial,updated_at:'2026-10-26 10:00:00',gps_at:'2026-10-26 09:59:00'};
 assert.deepEqual(latestLocation(old,{...old,updated_at:'2026-10-26 09:00:00'}),old);
 assert.equal(latestLocation(old,{ok:false,message:'timeout'}).query_error,'timeout');
 assert.equal(latestLocation(old,{...old,updated_at:'2026-10-26 10:01:00'}).query_error,'');
});
test('direct communication confirms serial and battery supplement must match event timestamps',async()=>{
 const service=new Integrations();let calls=0;
 service.api=async(b,path)=>{calls++;return path.endsWith('comunicacao')?{veiculo:{codVeiculo:'2'},equipamento:{numeroEquipamento:serial,codEquipamento:'1'},comunicacao:{dataServidor:'2026-10-26 10:00:00',dataGPS:'2026-10-26 09:59:00'}}:{localizacao:{codVeiculo:'2',dataServidor:'2026-10-26 09:00:00',dataGPS:'2026-10-26 08:59:00',bateriaInterna:80}};};
 const result=await service.equipmentLocation('imperatriz',serial,{vehicle_id:'2',equipment_id:'1'});assert.equal(result.internal_battery,'');assert.equal(calls,2);
 await assert.rejects(service.equipmentLocation('imperatriz','024000002',{vehicle_id:'2',equipment_id:'1'}),e=>e.status===422);
});
