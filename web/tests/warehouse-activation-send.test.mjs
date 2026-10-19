import test from 'node:test';import assert from 'node:assert/strict';
import {sendWarehouseActivation} from '../backend/warehouse-activation-send.mjs';
import {submitAryaActivation} from '../backend/arya-activation.mjs';
import {Integrations} from '../backend/integrations.mjs';
test('legacy sender and provider writer cannot send, even a prepared confirmed batch',async()=>{
 const trap=new Proxy({}, {get(){assert.fail('No database or provider access allowed');}});
 await assert.rejects(sendWarehouseActivation({pool:trap,service:trap,body:{confirmed:true,action:'send'}}),{status:410});
 await assert.rejects(submitAryaActivation(trap,['8955000000000000001']),{status:410});
 const service=Object.create(Integrations.prototype);
 await assert.rejects(service.aryaRequest('/tickets/bulk/by-iccid',{iccids:['8955000000000000001']},{write:true}),{status:410});
});
