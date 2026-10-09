import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,Integrations} from '../backend/integrations.mjs';
import {internalBattery,internalBatteryDetails} from '../public/stock-location.js';
import {mergeConfirmed} from '../backend/read-sources.mjs';
test('internal battery is separate and displayed directly with voltage',()=>{
 const row=normalize({bateria:0,bateriaInterna:95,bateriaInternaVoltagem:4.2,bateriaInternaVoltagemOrigem:'estimada_percentual_st300'});
 assert.equal(internalBatteryDetails(row),'Interna: 4,2 V · 95% (tensão estimada)');assert.equal(internalBattery(0,' V'),'0 V');assert.equal(row.battery,'0');assert.equal(row.internal_battery,'95');assert.equal(internalBattery(row.internal_battery),'95%');
 assert.equal(internalBattery(normalize({bateriaInterna:0}).internal_battery),'0%');
 for(const v of [undefined,null,'','bad',-1])assert.equal(internalBattery(v),'Não informado');
});
test('equipment communication carries new field without extra request',async()=>{
 const s=new Integrations();let calls=0;s.api=async()=>{calls++;return{veiculo:{codVeiculo:7},equipamento:{numeroSerie:'024000001'},comunicacao:{bateria:0,bateriaInterna:95,bateriaInternaVoltagem:4.2,bateriaInternaVoltagemOrigem:'estimada_percentual_st300'}};};
 const r=await s.equipmentLocation('imperatriz','024000001',{vehicle_id:'7'});assert.equal(r.internal_battery,'95');assert.equal(calls,1);
});
test('different samples cannot fill internal battery from web',()=>{
 assert.equal(mergeConfirmed({updated_at:'2026-10-09T12:00:00Z',gps_at:'2026-10-09T12:00:00Z',internal_battery:''},{updated_at:'2026-10-09T13:00:00Z',gps_at:'2026-10-09T13:00:00Z',internal_battery:'95'}).internal_battery,'');
});

test('location supplies internal battery only for the same vehicle and sample',async()=>{
 for(const variant of ['valid','wrong vehicle','old sample','failure']){
  const s=new Integrations();s.api=async(b,path)=>{
   if(path.endsWith('/comunicacao'))return{veiculo:{codVeiculo:7},equipamento:{numeroSerie:'024000001'},comunicacao:{dataEvento:'2026-10-09 12:00:00',dataComunicacao:'2026-10-09 12:00:03',bateria:12}};
   if(variant==='failure')throw Error('offline');
   return{ok:true,localizacao:{codVeiculo:variant==='wrong vehicle'?8:7,dataEvento:'2026-10-09 12:00:00',dataComunicacao:variant==='old sample'?'2026-10-08 12:00:03':'2026-10-09 12:00:03',bateriaInterna:95,bateriaInternaVoltagem:4.2,bateriaInternaVoltagemOrigem:'estimada_percentual_st300'}};
  };
  const r=await s.equipmentLocation('imperatriz','024000001',{vehicle_id:'7'});
  assert.equal(r.internal_battery,variant==='valid'?'95':'');assert.equal(r.internal_battery_voltage,variant==='valid'?'4.2':'');assert.equal(r.battery,'12');assert.equal(r.ok,true);
 }
});
