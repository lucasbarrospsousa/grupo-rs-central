import test from 'node:test';import assert from 'node:assert/strict';
import {Integrations} from '../backend/integrations.mjs';
import {SqlRepository} from '../public/sql-repository.js';
test('plate lookup recovers missing serial by equipment code and confirms current vehicle',async()=>{
 const s=new Integrations(),calls=[];s.api=async(b,p)=>{calls.push(p);return p.startsWith('/veiculos?')?{veiculos:[{codVeiculo:22,placa:'DEM1A00',equipamento:{codEquipamento:11}}],paginacao:{temMais:false}}:{equipamento:{codEquipamento:11,numeroSerie:'024000001',veiculo:{codVeiculo:22,placa:'DEM - 1A00'}}}};
 const row=await s.lookupEquipment('imperatriz','DEM1A00');assert.equal(row.serial,'024000001');assert.equal(row.vehicle_id,'22');assert.equal(calls.length,2);assert.equal(calls[1],'/equipamentos/11');
 for(const bad of [{codEquipamento:12},{numeroSerie:''},{veiculo:{codVeiculo:23,placa:'DEM1A00'}},{veiculo:{codVeiculo:22,placa:'OUT1A00'}},{ativo:false}]){
  s.api=async(b,p)=>p.startsWith('/veiculos?')?{veiculos:[{codVeiculo:22,placa:'DEM1A00',equipamento:{codEquipamento:11}}],paginacao:{temMais:false}}:{equipamento:{codEquipamento:11,numeroSerie:'024000001',veiculo:{codVeiculo:22,placa:'DEM1A00'},...bad}};
  await assert.rejects(s.lookupEquipment('imperatriz','DEM1A00'),/não confirmou/);
 }
});
test('successful save followed by failed history refresh remains a confirmed save',async()=>{
 for(const edit of [false,true]){const r=new SqlRepository();let writes=0;r.request=async()=>{writes++;return {ok:true,id:'saved'}};r.load=async()=>{throw Error('offline')};
 const out=edit?await r.updateReport({id:'saved',branch:'imperatriz',version:1},{notes:'edited'}):await r.saveReport({branch:'imperatriz',id:'request-id',notes:'created'});assert.equal(out.ok,true);assert.equal(out.refreshPending,true);assert.equal(writes,1);}
});
test('failed save is not reported as success or retried automatically',async()=>{const r=new SqlRepository();let calls=0;r.request=async()=>{calls++;throw Error('Conflict')};await assert.rejects(r.saveReport({branch:'imperatriz',id:'request-id'}),/Conflict/);assert.equal(calls,1);});
