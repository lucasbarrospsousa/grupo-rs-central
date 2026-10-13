import test from 'node:test';import assert from 'node:assert/strict';
import {finishedAryaActivations} from '../backend/arya-activation.mjs';
import {warehouseActivation} from '../backend/warehouse-activation.mjs';
import {reserveChip} from '../public/warehouse-activation-model.js';
const item={id:'qa',serial:'89999000000000000001',kind:'chip',chip_provider:'arya',status:'Disponível',classification:'Reserva',activation_state:'requested',activation_at:'2026-10-13T12:00:00Z'};
const ticket={id:123,iccid:item.serial,msisdn:'5599999999999',type:'Ativação',status:'Finalizado',statusInt:1,createdAt:'13/10/2026 09:00:00',endedAt:'13/10/2026 09:10:00'};
const result=(data,page=1,last=1,total=data.length)=>({status:true,data,current_page:page,last_page:last,total_filtered:total});
test('filtered pagination matches ICCID and stops as soon as tracked chips are found',async()=>{
 const calls=[],service={aryaRequest:async(path,p)=>{calls.push(p);assert.equal(path,'/ticket/user/table');assert.deepEqual(p.filters,{type:3,status:'1'});return p.page===1?result([{...ticket,id:1,iccid:'89999000000000000002'}],1,3,3):result([ticket],2,3,3);}};
 const found=await finishedAryaActivations(service,[item]);assert.equal(found.get(item.serial).phone,ticket.msisdn);assert.equal(calls.length,2);
});
test('old, wrong and nonfinal tickets do not confirm the current activation',async()=>{
 for(const t of [{...ticket,iccid:'89999000000000000002'},{...ticket,createdAt:'12/10/2026 09:00:00'}, {...ticket,endedAt:''}])assert.equal((await finishedAryaActivations({aryaRequest:async()=>result([t])},[item])).size,0);
 for(const t of [{...ticket,statusInt:0},{...ticket,type:'Cancelamento'}])await assert.rejects(finishedAryaActivations({aryaRequest:async()=>result([t])},[item]));
 assert.equal((await finishedAryaActivations({aryaRequest:async()=>result([ticket])},[{...item,activation_reference:'Chamado Árya 999'}])).size,0);
});
test('check all promotes only available reserve chips and never queries individual chips or sends activation',async()=>{
 const writes=[],rows=[item,{...item,id:'used',status:'Utilizado'},{...item,id:'emergency',classification:'Emergência'}];
 const c={query:async(sql,p)=>{if(sql.startsWith('select *'))return {rows};if(sql.startsWith('update'))writes.push({sql,p});return {};}};
 const service={aryaRequest:async(path)=>{assert.equal(path,'/ticket/user/table');return result([ticket]);},carrier:()=>assert.fail('Individual lookup forbidden')};
 const r=await warehouseActivation(c,{body:{action:'check'},branch:'imperatriz',role:'admin',service});assert.match(r.id,/^[a-f0-9-]{36}$/);assert.equal(r.response.confirmed,1);assert.deepEqual(r.response.ids,['qa']);assert.equal(writes.length,1);assert.match(writes[0].sql,/classification='Estoque'/);assert.equal(writes[0].p[1],'Chamado Árya 123');assert.equal(reserveChip({...item,activation_state:'active',classification:'Estoque'}),false);
 rows[0]={...item,classification:'Estoque',activation_state:'active'};writes.length=0;await warehouseActivation(c,{body:{action:'check'},branch:'imperatriz',role:'admin',service:{aryaRequest:()=>assert.fail('No remaining candidates')}});assert.equal(writes.length,0);
});
test('incomplete pagination aborts reconciliation before any stock update',async()=>{
 const c={query:async sql=>{if(sql.startsWith('select *'))return {rows:[item]};assert.ok(!sql.startsWith('update'));return {};}};
 await assert.rejects(warehouseActivation(c,{body:{action:'check'},branch:'imperatriz',role:'admin',service:{aryaRequest:async()=>result([],1,1,2)}}));
});
