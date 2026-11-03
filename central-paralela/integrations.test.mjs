import test from 'node:test';
import assert from 'node:assert/strict';
import {Integrations} from './integrations.mjs';

test('link recognizes exact reverse vehicle ID when vehicle summary omits equipment serial',async()=>{
 const requests=[];
 const request=async(url,options={})=>{
  requests.push({url,method:options.method||'GET'});
  if(url.endsWith('/login'))return{text:JSON.stringify({access_token:'test-token'}),status:200,headers:new Headers()};
  if(url.includes('/equipamentos?'))return{text:JSON.stringify({equipamentos:[{codEquipamento:1234,numeroSerie:'024307717',status:'A',veiculo:{codVeiculo:5678,placa:'AAA - 468'}}],paginacao:{temMais:false}}),status:200,headers:new Headers()};
  if(url.includes('/veiculos?'))return{text:JSON.stringify({veiculos:[{codVeiculo:5678,placa:'AAA - 468',codCliente:901,nomeCliente:'RS300',qtdClientesVinculadosAtivos:1}],paginacao:{temMais:false}}),status:200,headers:new Headers()};
  throw new Error('Unexpected mocked API request: '+url);
 };
 const service=new Integrations({secrets:()=>({grupo_rs_api_imperatriz_user:'test',grupo_rs_api_imperatriz_password:'test'}),request});
 const result=await service.prepareLink('imperatriz','024307717','AAA - 468');
 assert.equal(result.confirmed,true);
 assert.equal(result.payload.vehicle_id,'5678');
 assert.equal(result.payload.equipment_id,'1234');
 assert.equal(requests.some(r=>r.method==='POST'&&!r.url.endsWith('/login')),false);
});

test('link still rejects a vehicle ID that differs from the exact equipment lookup',async()=>{
 const request=async(url)=>{
  if(url.endsWith('/login'))return{text:JSON.stringify({access_token:'test-token'}),status:200,headers:new Headers()};
  if(url.includes('/equipamentos?'))return{text:JSON.stringify({equipamentos:[{codEquipamento:1234,numeroSerie:'024307717',status:'A',veiculo:{codVeiculo:5678,placa:'AAA - 468'}}],paginacao:{temMais:false}}),status:200,headers:new Headers()};
  if(url.includes('/veiculos?'))return{text:JSON.stringify({veiculos:[{codVeiculo:9999,placa:'AAA - 468',codCliente:901,nomeCliente:'RS300',qtdClientesVinculadosAtivos:1}],paginacao:{temMais:false}}),status:200,headers:new Headers()};
  throw new Error('Unexpected mocked API request: '+url);
 };
 const service=new Integrations({secrets:()=>({grupo_rs_api_imperatriz_user:'test',grupo_rs_api_imperatriz_password:'test'}),request});
 await assert.rejects(service.prepareLink('imperatriz','024307717','AAA - 468'),e=>e.status===409&&/vinculado a outro veículo/.test(e.message));
});

test('link accepts the exact equipment ID from vehicle summary when reverse vehicle ID is omitted',async()=>{
 const request=async(url)=>{
  if(url.endsWith('/login'))return{text:JSON.stringify({access_token:'test-token'}),status:200,headers:new Headers()};
  if(url.includes('/equipamentos?'))return{text:JSON.stringify({equipamentos:[{codEquipamento:1234,numeroSerie:'024307717',status:'A',veiculo:null}],paginacao:{temMais:false}}),status:200,headers:new Headers()};
  if(url.includes('/veiculos?'))return{text:JSON.stringify({veiculos:[{codVeiculo:5678,placa:'AAA - 468',codCliente:901,nomeCliente:'RS300',qtdClientesVinculadosAtivos:1,equipamento:{codEquipamento:1234}}],paginacao:{temMais:false}}),status:200,headers:new Headers()};
  throw new Error('Unexpected mocked API request: '+url);
 };
 const service=new Integrations({secrets:()=>({grupo_rs_api_imperatriz_user:'test',grupo_rs_api_imperatriz_password:'test'}),request});
 const result=await service.prepareLink('imperatriz','024307717','AAA - 468');
 assert.equal(result.confirmed,true);
});
