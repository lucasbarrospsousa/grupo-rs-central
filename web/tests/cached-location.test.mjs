import test from 'node:test';import assert from 'node:assert/strict';
import {Integrations} from '../backend/integrations.mjs';
import {guardedIntegrations} from '../backend/background-sync.mjs';
import {locationTime} from '../public/stock-location.js';
const serial='024000001',codes={vehicle_id:'7',equipment_id:'8'};
const response=()=>({veiculo:{codVeiculo:7,placa:'ABC1D23'},equipamento:{codEquipamento:8,numeroSerie:serial},comunicacao:{latitude:-5,longitude:-47,bateria:0,bateriaInterna:95,bateriaInternaVoltagem:4.2,ignicao:0,dataEvento:'2026-10-05 10:00:00.000',dataComunicacao:'2026-10-05 10:00:03.517'}});
test('saved vehicle code makes one telemetry call, with zero preserved and both timestamps',async()=>{
 const s=new Integrations(),calls=[];s.equipment=()=>{throw Error('unexpected equipment lookup');};s.api=async(b,p)=>{calls.push(p);return response();};
 const r=await s.equipmentLocation('imperatriz',serial,codes);assert.deepEqual(calls,['/veiculos/7/comunicacao']);assert.equal(r.battery,'0');assert.equal(r.ignition,'0');assert.equal(r.gps_at,'2026-10-05 10:00:00.000');assert.equal(r.updated_at,'2026-10-05 10:00:03.517');assert.equal(r.plate,'ABC1D23');assert.equal(r.client,'');
});
test('cached code rejects changed vehicle, tracker or missing series before exposing position',async()=>{
 for(const mutate of [d=>d.veiculo.codVeiculo=9,d=>d.equipamento.codEquipamento=9,d=>d.equipamento.numeroSerie='024000002',d=>delete d.equipamento.numeroSerie]){const s=new Integrations(),d=response();mutate(d);s.api=async()=>d;await assert.rejects(s.equipmentLocation('imperatriz',serial,codes),/não confirmou/);}
});
test('no saved code resolves equipment once, without titular lookup',async()=>{const s=new Integrations();let calls=0;s.equipment=async()=>{calls++;return{vehicle_id:'7'};};s.api=async()=>response();assert.equal((await s.equipmentLocation('imperatriz',serial)).ok,true);assert.equal(calls,1);});
test('server cache lookup is branch scoped; both mode never enriches telemetry with owner',async()=>{
 const queries=[],received=[],pool={query:async(sql,args)=>{queries.push({sql,args});return{rows:sql.includes('location_device_codes')?[{codes}]:[{mode:'both'}]};}};
 const service=guardedIntegrations(pool,{equipmentLocation:async(...args)=>{received.push(args);return{ok:true};}},{captureCodes:false});
 await service.stockCommunication('imperatriz',serial);await service.stockCommunication('maraba',serial);
 assert.deepEqual(received,[['imperatriz',serial,codes],['maraba',serial,codes]]);assert.equal(queries.filter(q=>q.sql.includes('location_device_codes')).length,2);
});
test('GPS/server presentation handles milliseconds and explicit UTC in Fortaleza',()=>{assert.match(locationTime('2026-10-05 10:00:03.517'),/10:00:03/);assert.match(locationTime('2026-10-05T13:00:03Z'),/10:00:03/);assert.equal(locationTime(''),'Não informado');});
