import test from 'node:test';
import assert from 'node:assert/strict';
import {Integrations,connectionState} from '../backend/integrations.mjs';
import {communication} from '../public/stock-live.js';
test('missing contacts use exact API series and exact carrier ICCID',async()=>{
 const s=new Integrations(),serial='024000001',iccid='8955000000000000001';
 s.equipmentPortal=async()=>({serial,iccid:'',phone:''});s.equipment=async()=>({serial,iccid});s.location=async()=>({ok:false});s.carrier=async()=>({ok:true,iccid,phone:'11999999999'});
 const r=await s.stockDetails('araguaina',serial);assert.equal(r.equipment.iccid,iccid);assert.equal(r.equipment.phone,'11999999999');
 s.equipment=async()=>({serial:'024000002',iccid});const mismatch=await s.stockDetails('araguaina',serial);assert.equal(mismatch.equipment.iccid,'');assert.equal(mismatch.equipment.phone,'');
 s.equipment=async()=>({serial,iccid});s.carrier=async()=>({ok:true,iccid:'8955000000000000002',phone:'11999999999'});assert.equal((await s.stockDetails('araguaina',serial)).equipment.phone,'');
});
test('stock joins by exact serial and falls back to Link only with confirmed ICCID',async()=>{
 const s=new Integrations(),calls=[];s.equipmentPortal=async(b,n)=>{calls.push([b,n]);return{iccid:'8955000000000000001'};};s.location=async(b,n)=>({ok:true,serial:n});s.carrier=async(p,n)=>{calls.push([p,n]);return p==='arya'?{ok:false,message:'Not found'}:{ok:true,connectivity:'Online'};};
 const r=await s.stockDetails('maraba','024000001');assert.equal(r.chip.connectivity,'Online');assert.deepEqual(calls,[['maraba','024000001'],['arya','8955000000000000001'],['link','8955000000000000001']]);
});
test('platform failure preserves independently confirmed position and never guesses chip',async()=>{
 const s=new Integrations();s.equipmentPortal=async()=>{throw Error('Unavailable');};s.location=async()=>({ok:true});s.carrier=async()=>{throw Error('must not query');};const r=await s.stockDetails('imperatriz','024000001');assert.equal(r.location.ok,true);assert.equal(r.equipment.message,'Unavailable');assert.equal(r.chip.ok,false);
});
test('chip registration status is not presumed online and timestamps preserve platform timezone',()=>{
 assert.equal(connectionState('Ativo'),'Não informado');assert.equal(connectionState(false),'Off');assert.equal(connectionState('Online'),'Online');
 const now=Date.parse('2026-09-24T13:00:00Z'),sample={ok:true,updated_at:'2026-09-24 09:55:00',gps_at:'2026-09-24 09:55:00',ignition:'1'};
 assert.equal(communication(sample,now),'Atualizado');assert.equal(communication({...sample,ignition:'0'},now),'Desligado');assert.equal(communication(sample,now+3600000),'Desatualizado');assert.equal(communication({ok:false,message:'timeout'},now),'Consulta pendente');
});
