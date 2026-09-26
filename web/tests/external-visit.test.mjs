import test from 'node:test';
import assert from 'node:assert/strict';
import {businessMutation} from '../backend/business.mjs';
const body={reason:'Troca de aparelho',medium:'App de rastreamento',notes:'test',clientId:'1',clientName:'Test',vehicleId:'2',plate:'TEST123',replacement:'replacement',replacementVersion:1};
const service={clients:async()=>[{id:'1',name:'Test'}],clientVehicles:async()=>[{vehicle_id:'2',plate:'TEST123',serial:'800000001'}]};
for(const status of ['Estoque','Instalado'])test('external arrival with replacement '+status,async()=>{
 const calls=[];const c={query:async(sql,params)=>{calls.push([sql,params]);return {rows:sql.startsWith('select id,serial')?[{id:'replacement',serial:'800000002',version:1,data:{status}}]:[]};}};
 const run=()=>businessMutation(c,{path:'/api/maintenance',method:'POST',body,branch:'imperatriz',user:{user_id:'test'},role:'operator',service});
 if(status==='Instalado'){await assert.rejects(run,/reposição indisponível/);assert.equal(calls.length,1);return;}
 await run();const inserted=calls.find(([sql])=>sql.startsWith('insert into central_homologacao.visits'))[1];assert.equal(inserted[2],null);assert.equal(inserted[3].currentSerial,'800000001');assert.equal(inserted[3].installSerial,'800000002');assert.equal(calls.filter(([sql])=>sql.startsWith('update central_homologacao.devices')).length,1);
});
