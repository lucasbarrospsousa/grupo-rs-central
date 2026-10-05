import test from 'node:test';import assert from 'node:assert/strict';
import {savedChipStatus,providerFromApn} from '../backend/chip-status.mjs';
import {codeResult} from '../backend/code-scan.mjs';
const iccid='8955000000000000001';
test('saved APN selects exactly one provider, including Link without a Hinova attempt',async()=>{
 for(const [apn,provider] of [[' Hinova.BR ','arya'],['linksolutions.br','link']]){const calls=[];const result=await savedChipStatus({carrier:async(p,id)=>{calls.push(p);assert.equal(id,iccid);return{ok:true,iccid,status:'Ativo'};}},{iccid,apn});assert.equal(result.ok,true);assert.deepEqual(calls,[provider]);}
});
test('provider failure never fans out to another operator, and returned ICCID must match',async()=>{
 for(const answer of [()=>{throw Error('offline');},()=>({ok:false}),()=>({ok:true,iccid:'8955000000000000002'})]){let calls=0;const result=await savedChipStatus({carrier:async()=>{calls++;return answer();}},{iccid,apn:'linksolutions.br'});assert.equal(result.ok,false);assert.equal(calls,1);assert.equal(result.provider,'link');}
});
test('missing or unsupported APN and invalid ICCID never trigger remote queries',async()=>{
 const service={carrier:()=>{throw Error('must not be called');}};for(const apn of ['',null,'multi','other-link.br']){assert.equal(providerFromApn(apn),null);const r=await savedChipStatus(service,{iccid,apn});assert.equal(r.ok,false);assert.match(r.message,/APN/);}assert.match((await savedChipStatus(service,{iccid:'bad',apn:'hinova.br'})).message,/ICCID/);
});
test('probe captures APN and SIM on the same confirmed equipment response, including unlinked',()=>{
 const e={ok:true,serial:'024000001',id:'7',binding_known:true,apn:' LinkSolutions.BR ',iccid};const r=codeResult({serial:e.serial},e);assert.equal(r.apn,'linksolutions.br');assert.equal(r.iccid,iccid);assert.equal(r.state,'unlinked');assert.equal(codeResult({serial:e.serial},{...e,apn:''}).apn,'');
});
