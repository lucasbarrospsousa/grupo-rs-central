import test from 'node:test';import assert from 'node:assert/strict';
import {validateConfigurator,configuredData,configuratorFetch} from '../backend/configurator.mjs';
const payload={action:'save',branch:'imperatriz',serial:'024999991',iccid:'8955000000000000001',phone:'99999999999',operator:'CLARO',version:0,key:'11111111-1111-1111-1111-111111111111'};
test('configurator preserves identifiers and branch-specific stock rules',()=>{
 validateConfigurator(payload);assert.equal(configuredData(null,payload).status,'Reserva');
 for(const branch of ['araguaina','acailandia','maraba'])assert.equal(configuredData(null,{...payload,branch}).status,'Estoque');
 const updated=configuredData({data:{plate:'ABC1D23',client:'Synthetic',status:'Instalado'}},payload);assert.equal(updated.status,'Manutenção');assert.equal(updated.plate,'ABC1D23');assert.equal(updated.serial,payload.serial);
});
test('configurator rejects invalid identity and denies unauthenticated requests before SQL',async()=>{
 assert.throws(()=>validateConfigurator({...payload,serial:'ABC1D23'}));assert.throws(()=>validateConfigurator({...payload,version:-1}));
 const result=await configuratorFetch(new Request('https://example.invalid/internal/configurator',{method:'POST'}),{query:()=>{throw Error('must not query');}});assert.equal(result.status,401);
});
