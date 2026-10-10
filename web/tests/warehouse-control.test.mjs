import test from 'node:test';import assert from 'node:assert/strict';
import {warehouseSeries,warehouseSummary,warehouseDepartures,warehouseDay} from '../public/warehouse-model.js';
import {branchRouteVisible} from '../public/branch-navigation.js';
import {businessMutation} from '../backend/business.mjs';
const rows=[{serial:'01',kind:'device',status:'Disponível',classification:'Estoque'},{serial:'02',kind:'chip',status:'Disponível',classification:'Emergência'},{serial:'03',kind:'chip',status:'Disponível',classification:'Reserva'}];
const event=(serial,type,destination,atISO)=>({serial,type,destination,atISO});
test('only manual known items count; dispatch and detection do not duplicate arrival',()=>{
 const events=[event('01','Envio','Araguaína','2026-10-01T12:00:00Z'),event('01','Utilizado','araguaina • Aparelho 01','2026-10-02T12:00:00Z'),event('other','Utilizado','maraba','2026-10-03T12:00:00Z'),event('02','Telefone atualizado','maraba','2026-10-03T12:00:00Z')];assert.equal(warehouseDepartures(rows,events).length,1);assert.deepEqual(warehouseSummary(rows,events,new Date('2026-10-01T14:00:00Z')),[1,0,1,1,1]);
});
test('three months, year boundary, four lines, no future or undated points',()=>{
 const events=[event('01','Utilizado','maraba','2025-12-01T12:00:00Z'),event('02','Utilizado','imperatriz','2026-01-10T12:00:00Z'),event('03','Utilizado','acailandia','2026-01-11T12:00:00Z')];
 const r=warehouseSeries(rows,events,{month:'2026-01',months:3,now:new Date('2026-01-10T20:00:00Z')});assert.equal(r.dates[0],'2025-11-01');assert.equal(r.dates.at(-1),'2026-01-10');assert.equal(r.lines.length,4);assert.equal(r.events.length,2);assert.equal(warehouseSeries(rows,events,{month:'2026-01',kind:'chip',now:new Date('2026-01-10T20:00:00Z')}).events.length,1);assert.equal(warehouseDay('2026-01-02T01:00:00Z'),'2026-01-01');
});
test('warehouse only available in Imperatriz, including backend writes',async()=>{
 for(const branch of ['araguaina','acailandia','maraba']){assert.equal(branchRouteVisible(branch,'warehouse'),false);await assert.rejects(businessMutation({query(){throw Error('must not access SQL');}},{path:'/api/warehouse',method:'POST',body:{},branch,user:{},role:'admin'}),/somente em Imperatriz/);}
});
