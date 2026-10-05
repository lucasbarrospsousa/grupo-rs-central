import test from 'node:test';import assert from 'node:assert/strict';
import {ignitionState,ignitionCounts,ignitionRows} from '../public/maintenance-ignition.js';
import {confirmedIgnition,maintenanceTick} from '../backend/maintenance-monitor.mjs';
import {maintenanceShare} from '../public/maintenance-share.js';
import {motionRequestKind} from '../public/page-motion.js';
test('ignition distinguishes absent data and combines filtered percent with active fleet',()=>{
 for(const v of [null,undefined,'','unknown','Offline'])assert.equal(ignitionState(v),'unknown');
 for(const v of [0,false,'Desligada','off'])assert.equal(ignitionState(v),'off');
 const rows=[{ignition:1},{ignition:0},{}];assert.deepEqual(ignitionCounts(rows),{on:1,off:1,unknown:1});
 assert.equal(maintenanceShare(ignitionRows(rows,'on').length,100),1);assert.equal(ignitionRows(rows).length,3);
 assert.equal(motionRequestKind('integrations/maintenance?branch=imperatriz&refresh=1'),'quiet');
});
test('only confirmed serial and plate can supply ignition',()=>{
 const row={serial:'024000001',plate:'ABC-1D23'},result={ok:true,serial:row.serial,plate:'ABC1D23',ignition:0,updated_at:'2026-10-05T08:00:00-03:00'};
 assert.equal(confirmedIgnition(row,result).ignition,'off');
 for(const patch of [{serial:'024000002'},{plate:'XYZ1A23'},{ok:false},{ignition:null}])assert.throws(()=>confirmedIgnition(row,{...result,...patch}));
});
test('background worker saves individual failures and releases its lease',async()=>{
 const saved=[],rows=[{branch:'imperatriz',serial:'024000001',plate:'ABC1D23',baseline:'x'},{branch:'maraba',serial:'024000002',plate:'XYZ1A23',baseline:'x'}];let released=false;
 const pool={async query(sql,args){if(sql.includes('maintenance_claim'))return{rows:[{data:{rows}}]};if(sql.includes('maintenance_save'))saved.push(args.at(-1));if(sql.includes('maintenance_release'))released=true;return{rows:[]};}};
 const service={async stockCommunication(branch,serial){if(branch==='maraba')throw Error('Indisponível');return{ok:true,serial,plate:'ABC1D23',ignition:1};}};
 assert.equal((await maintenanceTick(pool,{service})).processed,2);assert.equal(saved.filter(x=>x.ignition==='on').length,1);assert.equal(saved.filter(x=>x.ignition===null).length,1);assert.equal(released,true);
});
