import test from 'node:test';import assert from 'node:assert/strict';
import {monitorStock} from '../backend/background-sync.mjs';
import {monitorState,monitorCounts,basePlatforms,monitorDate} from '../public/stock-monitor.js';
test('communication and query dates use Fortaleza, including API milliseconds and missing dates',()=>{
 assert.equal(monitorDate('2026-08-25 21:42:02.613'),'25/08/2026, 21:42:02');
 assert.equal(monitorDate('2026-10-04T16:45:11Z'),'04/10/2026, 13:45:11');
 assert.equal(monitorDate('2026-10-02T18:27:44-03:00'),'02/10/2026, 18:27:44');
 assert.equal(monitorDate(null),'Não informado');assert.equal(monitorDate('invalid'),'Não informado');
});
const at=Date.parse('2026-10-03T19:00:00Z');
const row=(ignition,age,ok=true)=>({observation:{location:{ok,ignition,updated_at:new Date(at-age).toISOString(),gps_at:new Date(at-age).toISOString()}}});
test('shared stock thresholds and mutually exclusive counts include missing data',()=>{
 assert.equal(monitorState(row(true,600000),at),'on');assert.equal(monitorState(row(true,600001),at),'stale');assert.equal(monitorState(row(false,3600000),at),'off');assert.equal(monitorState(row(false,3600001),at),'stale');assert.equal(monitorState(row(false,0,false),at),'unknown');
 assert.deepEqual(monitorCounts([row(true,0),row(false,0),row(true,700000),row(false,0,false)],at),{on:1,off:1,stale:1,unknown:1,gps:0});assert.equal(basePlatforms.maraba,'https://mab.ogrupors.com.br/');
});
test('worker skips chip until due and drops unnecessary telemetry and private identity',async()=>{
 let chipCalls=0;const service={stockCommunication:async()=>({ok:true,ignition:true,updated_at:'now',gps_at:'now',lat:1,client:'private'}),carrier:async()=>{chipCalls++;return{ok:true,iccid:'8955000000000000001',connectivity:'Online',phone:'private'};}};
 const a=await monitorStock(service,{branch:'imperatriz',serial:'024000001',iccid:'8955000000000000001',chip_due:false,chip:{ok:true},chip_checked_at:'earlier'});assert.equal(chipCalls,0);assert.equal(a.chip_checked_at,'earlier');assert.equal(a.location.client,undefined);assert.equal(a.location.lat,undefined);
 const b=await monitorStock(service,{branch:'imperatriz',serial:'024000001',iccid:'8955000000000000001',chip_due:true});assert.equal(chipCalls,1);assert.equal(b.chip.phone,undefined);assert.equal(b.chip.connectivity,'Online');
});
test('communication failure is explicit and does not prevent independent chip read',async()=>{
 const out=await monitorStock({stockCommunication:async()=>{throw Error('unreachable');},carrier:async()=>({ok:true,status:'Ativo'})},{iccid:'8955000000000000001',chip_due:true});assert.equal(out.location.ok,false);assert.equal(out.chip.ok,true);
});
