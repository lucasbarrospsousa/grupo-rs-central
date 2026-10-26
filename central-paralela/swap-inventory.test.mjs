import {test} from 'node:test';import assert from 'node:assert/strict';
import {inventory} from './inventory.mjs';
const incoming='024000001',outgoing='024000002';
function fixture(){
 let data={rows:[{id:'a',serial:incoming,version:1},{id:'b',serial:outgoing,version:1}],operations:[],audit:[]},writes=[];
 let first={id:'11',serial:incoming,vehicle_id:'1',plate:'AAA - 450',binding_known:true},second={id:'22',serial:outgoing,vehicle_id:'2',plate:'ABC1D23',binding_known:true};
 const document=async()=>{const copy=structuredClone(data);return{data:copy,save:async()=>{data=structuredClone(copy);}};};
 const service={swapEquipment:async(b,s)=>structuredClone(s===incoming?first:second),api:async(b,path)=>{
  if(path.includes('?'))return{veiculos:[{codVeiculo:'2',placa:'ABC1D23'}],paginacao:{temMais:false}};
  if(path==='/equipamentos/22')return{equipamento:{codEquipamento:'22',numeroEquipamento:outgoing,veiculo:{codVeiculo:second.vehicle_id,placa:second.plate}}};
  if(path==='/veiculos/2/comunicacao')return{veiculo:{codVeiculo:'2',placa:'ABC1D23'},equipamento:{codEquipamento:'22'}};
  if(path==='/veiculos/1/comunicacao')return{veiculo:{codVeiculo:'1',placa:'AAA - 450'},equipamento:null};
  throw Error('unexpected endpoint');
 },swapAssociate:async(b,vehicle,equipment,move)=>{writes.push({vehicle,equipment,move});if(move){first.vehicle_id='2';first.plate='ABC1D23';second.vehicle_id='';second.plate='';}else{second.vehicle_id='1';second.plate='AAA - 450';}}};
 const user={username:'tester',permissions:{views:['stock'],writes:['stock']},branches:[{id:'imperatriz'}]};
 const run=(action,extra={})=>inventory({input:{action,id:'a',branch:'imperatriz',version:1,key:crypto.randomUUID(),...extra},user,document,service});
 return{run,user,service,writes,data:()=>data};
}
test('swap confirms both identities, sends once per phase, records both rows and audit',async()=>{
 const f=fixture();const preview=await f.run('swap-preview',{plate:'ABC1D23'});assert.equal(f.writes.length,0);
 const result=await f.run('swap-execute',{operation:preview.operation.id,confirmed:true});assert.equal(result.operation.state,'complete');assert.equal(f.writes.length,2);assert.equal(f.data().rows[0].plate,'ABC1D23');assert.equal(f.data().rows[1].status,'Manutenção');assert.equal(f.data().audit.length,1);
 await f.run('swap-execute',{operation:preview.operation.id,confirmed:true});assert.equal(f.writes.length,2);assert.equal(f.data().audit.length,1);
});
test('uncertain first send is never repeated and check is read-only',async()=>{
 const f=fixture();const preview=await f.run('swap-preview',{plate:'ABC1D23'});let sends=0;f.service.swapAssociate=async()=>{sends++;throw Error('timeout');};
 await f.run('swap-execute',{operation:preview.operation.id,confirmed:true});await f.run('swap-check',{operation:preview.operation.id});await f.run('swap-execute',{operation:preview.operation.id,confirmed:true});assert.equal(sends,1);
});
test('reader cannot preview or execute and confirmation is mandatory',async()=>{
 const f=fixture();f.user.permissions.writes=[];await assert.rejects(f.run('swap-preview',{plate:'ABC1D23'}),e=>e.status===403);f.user.permissions.writes=['stock'];const p=await f.run('swap-preview',{plate:'ABC1D23'});await assert.rejects(f.run('swap-execute',{operation:p.operation.id}),e=>e.status===400);assert.equal(f.writes.length,0);
});
