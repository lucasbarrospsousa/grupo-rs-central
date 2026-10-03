import test from 'node:test';import assert from 'node:assert/strict';
import {sourceIntegrations} from '../backend/read-sources.mjs';
import {confirmedIdentity} from '../public/location-identity.js';
for(const branch of ['imperatriz','araguaina','acailandia','maraba'])test('both: telemetry never waits for web; identity is requested separately: '+branch,async()=>{
 let apiCalls=0,webCalls=0;const location={ok:true,serial:'024000001',vehicle_id:'7',plate:'ABC1D23',lat:-5,lng:-47,updated_at:'2026-10-03T10:00:00',gps_at:'2026-10-03T10:00:00',ignition:'1'};
 const s=sourceIntegrations({equipmentLocation:async()=>{apiCalls++;return location}},async()=> 'both',{vehicles:async()=>{webCalls++;return [{serial:location.serial,vehicle_id:'7',client:'Cliente de teste',plate:'ABC1D23'}]}});
 assert.deepEqual(await s.stockCommunication(branch,location.serial),location);assert.equal(webCalls,0);const identity=await s.locationIdentity(branch,location.serial);assert.equal(webCalls,1);assert.equal(apiCalls,1);assert.equal(confirmedIdentity(location,identity,location.serial).client,'Cliente de teste');assert.equal(location.client,undefined);
});
test('only API does not consult web; web-only preference is preserved',async()=>{
 const api={equipmentLocation:async()=>({ok:true})},web={location:async()=>({source:'web'}),vehicles:()=>{throw Error('unexpected')}};
 const a=sourceIntegrations(api,async()=> 'api',web);assert.equal((await a.locationIdentity('maraba','024000001')).skipped,true);
 const w=sourceIntegrations(api,async()=> 'web',web);assert.equal((await w.stockCommunication('maraba','024000001')).source,'web');
});
test('API failure does not silently start web and ambiguous identities are rejected',async()=>{
 const s=sourceIntegrations({equipmentLocation:async()=>{throw Error('API offline')}},async()=> 'both',{vehicles:async()=>[]});await assert.rejects(s.stockCommunication('araguaina','024000001'),/API offline/);await assert.rejects(s.locationIdentity('araguaina','024000001'),/únicos/);
});
test('late identity cannot replace communication or match another vehicle',()=>{
 const loc={ok:true,vehicle_id:'7',plate:'ABC-1234',lat:-5},identity={ok:true,vehicle_id:'7',plate:'ABC1234',serial:'024000001',client:'Teste',lat:99};assert.equal(confirmedIdentity(loc,identity,'024000001').lat,undefined);
 for(const change of [{serial:'024000002'},{vehicle_id:'8'},{plate:'XYZ1234'}])assert.throws(()=>confirmedIdentity(loc,{...identity,...change},'024000001'),/não coincide/);
 assert.throws(()=>confirmedIdentity({...loc,ok:false},identity,'024000001'));
});
