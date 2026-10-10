import {permitted} from '../backend/user-access.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {swapSnapshot,swapState} from '../backend/equipment-swap.mjs';
const snap={incoming:{serial:'024000001',id:'1',vehicle_id:'10',plate:'XRS - 450'},outgoing:{serial:'024000002',id:'2',vehicle_id:'20',plate:'ABC1D23'}};
const eq=(d,vehicle_id=d.vehicle_id,plate=d.plate)=>({...d,vehicle_id,plate,binding_known:true});
test('swap distinguishes original, partial, complete and unrelated bindings',()=>{
 assert.equal(swapState(snap,eq(snap.incoming),eq(snap.outgoing)),'original');
 assert.equal(swapState(snap,eq(snap.incoming,'20','ABC1D23'),eq(snap.outgoing,'','')),'partial');
 assert.equal(swapState(snap,eq(snap.incoming,'20','ABC1D23'),eq(snap.outgoing,'10','XRS-450')),'complete');
 assert.equal(swapState(snap,eq(snap.incoming,'30','OTHER'),eq(snap.outgoing)),'conflict');
 assert.equal(swapState(snap,eq(snap.incoming),{...eq(snap.outgoing),binding_known:false}),'conflict');
});
const service=()=>({swapEquipment:async()=>({...snap.incoming,ok:true}),api:async(b,path)=>path.includes('?')?{veiculos:[{codVeiculo:20,placa:'ABC1D23',equipamento:{codEquipamento:2}}]}:path==='/veiculos/20/comunicacao'?{veiculo:{CodVeiculo:20,Placa:'ABC1D23',CodEquipamento:2,nomeCliente:'Teste',codCliente:5}}:{equipamento:{codEquipamento:2,numeroEquipamento:'024000002',veiculo:{codVeiculo:20,placa:'ABC1D23'}}}});
test('preview matches exact plate, equipment and base',async()=>{const r=await swapSnapshot(service(),'imperatriz','024000001','ABC-1D23');assert.deepEqual(r.incoming,snap.incoming);assert.deepEqual(r.outgoing,snap.outgoing);});
test('preview refuses ambiguous plate and unknown replacement',async()=>{const s=service(),old=s.api;s.api=async(b,p)=>p.includes('?')?{veiculos:[{codVeiculo:20,placa:'ABC1D23'},{codVeiculo:21,placa:'ABC1D23'}]}:old(b,p);await assert.rejects(swapSnapshot(s,'imperatriz','024000001','ABC1D23'),/única/);});
test('preview refuses changed destination equipment binding',async()=>{const s=service(),old=s.api;s.api=async(b,p)=>p.startsWith('/equipamentos/')?{equipamento:{codEquipamento:2,numeroEquipamento:'024000002',veiculo:{codVeiculo:99,placa:'OUTRA'}}}:old(b,p);await assert.rejects(swapSnapshot(s,'imperatriz','024000001','ABC1D23'),/não confirmado/);});

test('swap requires stock write permission',()=>{assert.equal(permitted({views:['stock'],writes:[]},'/api/integrations/equipment-swap','POST'),false);assert.equal(permitted({views:['stock'],writes:['stock']},'/api/integrations/equipment-swap','POST'),true);});
