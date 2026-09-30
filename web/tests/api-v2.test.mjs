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
test('titular lookup uses vehicles, then client endpoint revalidates identity',async()=>{
 const s=new Integrations();let paths=[];s.api=async(b,p)=>{paths.push(p);return {veiculos:[{codVeiculo:7,placa:'ABC1D23',titular:{codCliente:5,nomeCliente:'Example'},qtdClientesVinculadosAtivos:1,equipamento:{numeroSerie:serial}}],paginacao:{temMais:false}}};
 assert.deepEqual(await s.clients('imperatriz','ABC'),[{id:'5',name:'Example'}]);
 assert.equal((await s.clientVehicles('imperatriz','5','Example'))[0].serial,serial);
 assert.match(paths[0],/^\/veiculos\?q=ABC&skip=0&take=50$/);assert.match(paths[1],/^\/clientes\/5\/veiculos\?/);
 await assert.rejects(s.clientVehicles('imperatriz','6','Example'));
 await assert.rejects(s.clientVehicles('imperatriz','5','Different'));
 assert(paths.every(p=>!p.includes('associados')));
});
test('titular search fails closed for missing, ambiguous, conflicting and incomplete owners',async()=>{
 const s=new Integrations();let vehicle={codVeiculo:7,placa:'ABC1D23',titular:{codCliente:5,nomeCliente:'Example'},qtdClientesVinculadosAtivos:1,equipamento:{numeroSerie:serial}};
 s.api=async()=>({veiculos:[vehicle],paginacao:{temMais:false}});
 assert.equal((await s.binding('maraba',serial)).category,'eligible');
 vehicle={...vehicle,qtdClientesVinculadosAtivos:2};assert.equal((await s.binding('maraba',serial)).category,'review');await assert.rejects(s.clients('maraba','ABC'));
 vehicle={...vehicle,qtdClientesVinculadosAtivos:1,titular:null};await assert.rejects(s.clients('maraba','ABC'));
 s.api=async()=>({veiculos:[],paginacao:{temMais:true}});await assert.rejects(s.clients('maraba','ABC'),/Refine/);
});
test('client vehicles paginate, reject repeated cursors, and never accept a partial list',async()=>{
 const s=new Integrations();let calls=0;s.api=async()=>({veiculos:[{codVeiculo:++calls,placa:'ABC1D2'+calls,titular:{codCliente:5,nomeCliente:'Example'}}],paginacao:{temMais:calls===1,proximoSkip:50}});
 assert.equal((await s.clientVehicles('imperatriz','5','Example')).length,2);
 s.api=async()=>({veiculos:[],paginacao:{temMais:true,proximoSkip:0}});await assert.rejects(s.clientVehicles('imperatriz','5','Example'),/Paginação/);
});
test('each base prefers its dedicated API credential',()=>{
 for(const branch of ['imperatriz','araguaina','acailandia','maraba']){
 const s=new Integrations({secrets:()=>({['grupo_rs_api_'+branch+'_user']:'api-test',['grupo_rs_api_'+branch+'_password']:'test-only',grupo_rs_legacy_user:'legacy',grupo_rs_legacy_password:'legacy'})});assert.equal(s.credentials(branch,true).username,'api-test');}
});
test('history paginates and refuses mismatched vehicles and repeating cursors',async()=>{
 const s=new Integrations();s.vehicles=async()=>[{vehicle_id:'7',serial}];let calls=0;
 s.api=async(b,p)=>{assert.match(p,/^\/veiculos\/7\/posicoes\?/);return{codVeiculo:7,posicoes:[{id:++calls,data:'2026-09-30 00:00:30',latitude:'1',longitude:'2'}],paginacao:{temMais:calls===1,proximoSkip:100}}};
 const r=await s.history('imperatriz',serial,'2026-09-30T00:00','2026-09-30T01:00');assert.equal(r.rows.length,2);assert.equal(r.partial,false);assert.equal(r.rows[0].gps_at,'2026-09-30 00:00:30');
 s.api=async()=>({codVeiculo:8,posicoes:[],paginacao:{temMais:false}});await assert.rejects(s.history('imperatriz',serial,'2026-09-30T00:00','2026-09-30T01:00'));
 s.api=async()=>({codVeiculo:7,posicoes:[],paginacao:{temMais:true,proximoSkip:0}});await assert.rejects(s.history('imperatriz',serial,'2026-09-30T00:00','2026-09-30T01:00'),/Paginação/);
});
