import test from 'node:test';import assert from 'node:assert/strict';
import {filterWarehouseMovements as filter} from '../public/warehouse-movements-model.js';
test('Local shipment filters preserve historic, custom-destination, chip and detection records',()=>{
 const rows=[{serial:'01',kind:'device'},{serial:'89',kind:'chip'}],events=[
 {serial:'01',type:'Envio',destination:'COLINAS',atISO:'2026-10-01T02:00:00Z',note:'reposição'},
 {serial:'01',type:'Envio',destination:'Marabá',atISO:'2026-10-02T12:00:00Z'},
 {serial:'01',type:'Utilizado',destination:'Marabá',atISO:'2026-10-03T12:00:00Z',detected:true},
 {serial:'89',type:'Envio',destination:'Marabá',atISO:'2026-10-02T12:00:00Z'},
 {serial:'removed',kind:'device',type:'Envio',destination:'COLINAS',atISO:'2026-09-12T12:00:00Z'},
 {serial:'unknown',type:'Entrada',atISO:null}];const original=JSON.stringify(events);
 assert.equal(filter(events,rows,{month:'2026-10'}).length,1);
 assert.equal(filter(events,rows,{month:'2026-09',destination:'custom:COLINAS'}).length,2);
 assert.equal(filter(events,rows,{scope:'devices',destination:'maraba'}).length,2);
 assert.equal(filter(events,rows,{scope:'chips'}).length,1);
 assert.equal(filter(events,rows,{scope:'all'}).length,6);
 assert.equal(filter(events,rows,{query:'reposição'}).length,1);
 assert.equal(JSON.stringify(events),original);
});
