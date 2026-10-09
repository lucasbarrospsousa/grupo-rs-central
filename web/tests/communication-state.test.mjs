import test from 'node:test';
import assert from 'node:assert/strict';
import {communication,latestCommunication,communicationTime} from '../public/communication-state.js';
const sample={ok:true,serial:'024000001',ignition:1,updated_at:'2026-10-09 12:00:00.123',gps_at:'2026-10-09 12:00:00.000'};
const now=Date.parse('2026-10-09T15:00:15.123Z');
test('short ignition text uses server age with millisecond timezone correctly',()=>{
 assert.equal(communicationTime(sample.updated_at),now-15000);
 assert.equal(communication(sample,now),'Ligado · há 15 s');
 assert.equal(communication({...sample,ignition:0},now),'Desligado · há 15 s');
 assert.equal(communication(sample,now+480000),'Sem atualização · há 8 min');
 assert.equal(communication({...sample,ignition:null},now),'Ignição desconhecida · há 15 s');
});
test('failed and out-of-order responses preserve last confirmed ignition and timestamp',()=>{
 const failed=latestCommunication(sample,{ok:false,message:'timeout'});
 assert.equal(failed.ignition,1);assert.equal(failed.updated_at,sample.updated_at);
 assert.equal(communication(failed,now),'Sem atualização · há 15 s');
 const old=latestCommunication(sample,{...sample,updated_at:'2026-10-09 11:59:00',ignition:0});
 assert.equal(old.ignition,1);
 const staleEvent=latestCommunication(sample,{...sample,updated_at:'2026-10-09 12:01:00',gps_at:'2026-10-09 11:00:00',ignition:0});assert.equal(staleEvent.ignition,1);
 const fresh=latestCommunication(failed,{...sample,updated_at:'2026-10-09 12:01:00',gps_at:'2026-10-09 12:01:00',ignition:0});assert.equal(fresh.ignition,0);assert.equal(fresh.query_error,'');
});
