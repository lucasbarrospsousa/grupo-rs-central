import test from 'node:test';import assert from 'node:assert/strict';
import {monthlyShipments} from '../public/warehouse-monthly.js';
test('Monthly comparison preserves repeated shipments, custom destinations and removed-device history',()=>{
 const events=[{kind:'device',serial:'1',type:'Envio',destination:'COLINAS',atISO:'2026-09-02T12:00:00Z'},{kind:'device',serial:'1',type:'Envio',destination:'COLINAS',atISO:'2026-10-02T12:00:00Z'},{kind:'device',serial:'1',type:'Utilizado',detected:true,destination:'COLINAS',atISO:'2026-10-03T12:00:00Z'},{kind:'chip',serial:'89',type:'Envio',destination:'COLINAS',atISO:'2026-10-02T12:00:00Z'},{kind:'device',serial:'old',type:'Enviado',destination:'Marabá'},{kind:'device',serial:'future',type:'Envio',destination:'Marabá',atISO:'2026-11-01T12:00:00Z'}],before=JSON.stringify(events);
 const r=monthlyShipments([],events,{month:'2026-10',months:3,now:new Date('2026-10-13T12:00:00Z')});assert.equal(r.current,1);assert.equal(r.previous,1);assert.equal(r.total,2);assert.equal(r.difference,0);assert.equal(r.undated,1);assert.equal(r.partial,true);assert.deepEqual(r.keys,['2026-08','2026-09','2026-10']);assert.equal(r.groups[0].name,'COLINAS');assert.equal(JSON.stringify(events),before);
 assert.equal(monthlyShipments([],events,{month:'2026-10',months:3,destination:'maraba',now:new Date('2026-10-13T12:00:00Z')}).total,0);
 assert.equal(monthlyShipments([],events,{month:'2026-09',months:3}).difference,null);
});
test('Month boundaries use Fortaleza; comparison spans year boundaries',()=>{
 const r=monthlyShipments([],[{kind:'device',type:'Envio',atISO:'2026-01-01T02:00:00Z',destination:'Marabá'}],{month:'2026-01',months:3,now:new Date('2026-02-01T12:00:00Z')});assert.deepEqual(r.keys,['2025-11','2025-12','2026-01']);assert.equal(r.previous,1);assert.equal(r.current,0);assert.equal(r.difference,-100);assert.equal(r.partial,false);
});
