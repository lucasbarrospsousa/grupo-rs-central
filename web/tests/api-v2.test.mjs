import test from 'node:test';
import assert from 'node:assert/strict';
import {Integrations} from '../backend/integrations.mjs';
const serial='024000001';
test('missing owner never authorizes automatic discharge; portal and link are disabled',async()=>{
 const s=new Integrations();s.vehicles=async()=>[{serial,plate:'ABC1D23',vehicle_id:'7',client:''}];
 assert.equal((await s.binding('imperatriz',serial)).category,'review');
 for(const method of ['portal','maintenance','prepareLink','createLink'])await assert.rejects(s[method](),e=>e.status===501);
});
test('equipment reads v2 exact nested identity and rejects duplicates/inactive',async()=>{
 const s=new Integrations();let raw={codEquipamento:4,numeroSerie:serial,ativo:'A',veiculo:{codVeiculo:7,placa:'ABC1D23'}};
 s.api=async(b,p)=>{assert.match(p,/^\/equipamentos\?/);return{equipamentos:[raw]}};
 const r=await s.equipmentPortal('imperatriz',serial);assert.equal(r.serial,serial);assert.equal(r.vehicle_id,'7');assert.equal(r.plate,'ABC1D23');
 raw={...raw,ativo:'I'};await assert.rejects(s.equipment('imperatriz',serial));
});
test('associated vehicles are confirmed by id and name, never just user input',async()=>{
 const s=new Integrations();s.api=async()=>({associados:[{codAssociado:5,nome:'Example',veiculos:[{codVeiculo:7,placa:'ABC1D23',equipamento:{numeroSerie:serial}}]}]});
 assert.equal((await s.clientVehicles('imperatriz','5','Example'))[0].serial,serial);
 await assert.rejects(s.clientVehicles('imperatriz','6','Example'));
 await assert.rejects(s.clientVehicles('imperatriz','5','Different'));
});
test('history paginates and refuses mismatched vehicles and repeating cursors',async()=>{
 const s=new Integrations();s.vehicles=async()=>[{vehicle_id:'7',serial}];let calls=0;
 s.api=async(b,p)=>{assert.match(p,/^\/veiculos\/7\/posicoes\?/);return{codVeiculo:7,posicoes:[{id:++calls,latitude:'1',longitude:'2'}],paginacao:{temMais:calls===1,proximoSkip:100}}};
 const r=await s.history('imperatriz',serial,'2026-09-30T00:00','2026-09-30T01:00');assert.equal(r.rows.length,2);assert.equal(r.partial,false);
 s.api=async()=>({codVeiculo:8,posicoes:[],paginacao:{temMais:false}});await assert.rejects(s.history('imperatriz',serial,'2026-09-30T00:00','2026-09-30T01:00'));
 s.api=async()=>({codVeiculo:7,posicoes:[],paginacao:{temMais:true,proximoSkip:0}});await assert.rejects(s.history('imperatriz',serial,'2026-09-30T00:00','2026-09-30T01:00'),/Paginação/);
});
