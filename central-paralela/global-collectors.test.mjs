import test from 'node:test';import assert from 'node:assert/strict';
import {collect,chipPage,reconcileChips} from './global-collectors.mjs';
const iccid='89123456789012345678';
test('inactive legacy serials do not block pagination; active or unknown invalid serials still fail',()=>{
 const inactive={numeroSerie:'990000000000000001',ativo:'I',numeroChip:iccid};
 const page=equipamentos=>({ok:true,equipamentos,paginacao:{temMais:true,proximoSkip:300}});
 assert.deepEqual(chipPage(page([inactive,{serial:'024000001',ativo:'A',iccid}]),250),{rows:[{serial:'024000001',iccid}],more:true,next:300});
 assert.deepEqual(chipPage(page([inactive]),250),{rows:[],more:true,next:300});
 for(const ativo of ['A',undefined])assert.throws(()=>chipPage(page([{...inactive,ativo}]),250),/Série ausente/);
});
function fixture(){const data=Object.fromEntries(['imperatriz','araguaina','acailandia','maraba'].map(b=>[b,{rows:[],warehouse:{rows:[],movements:[]}}]));return {data,document:async b=>{const clone=structuredClone(data[b]);return{data:clone,save:async()=>{data[b]=structuredClone(clone)}}}};}
test('paginated global scan survives restart, commits only complete evidence, detects cross-branch conflict',async()=>{
 const f=fixture();f.data.imperatriz.warehouse.rows=[{kind:'chip',serial:iccid}];let calls=0;
 const service={api:async branch=>{calls++;return{ok:true,equipamentos:[{numeroEquipamento:'024000001',iccid,ativo:'A'}],paginacao:{temMais:false}}}};
 for(let n=0;n<3;n++){assert.equal((await collect({...f,job:{branch:'imperatriz',kind:'warehouse-links'},service})).finished,false);assert.equal(f.data.imperatriz.warehouse.rows[0].chip_link_result,undefined);}
 assert.equal((await collect({...f,job:{branch:'imperatriz',kind:'warehouse-links'},service})).finished,true);
 assert.equal(calls,4);assert.equal(f.data.imperatriz.warehouse.rows[0].chip_link_result.state,'conflict');
});
test('bad or repeated pagination rejects without changing saved results',async()=>{
 assert.throws(()=>chipPage({ok:true,equipamentos:[],paginacao:{temMais:true,proximoSkip:0}},0));
 const f=fixture(),job={branch:'imperatriz',kind:'warehouse-links'},service={api:async()=>({ok:true,equipamentos:[{serial:'024000001'}],paginacao:{temMais:true,proximoSkip:50}})};
 await collect({...f,job,service});const before=structuredClone(f.data);await assert.rejects(collect({...f,job,service}));assert.deepEqual(f.data,before);
});
test('provider lifecycle drives reserve; connectivity cannot activate and emergency is preserved',()=>{
 const store={rows:[{serial:iccid,kind:'chip',status:'Disponível',classification:'Emergência',chip_provider:'arya'}]};
 reconcileChips(store,[{iccid,status:'ATIVO',active:true}],'arya','2026-10-26');assert.equal(store.rows[0].classification,'Emergência');
 reconcileChips(store,[{iccid,status:'PENDENTE',active:false}],'arya','2026-10-26');assert.equal(store.rows[0].classification,'Reserva');
 reconcileChips(store,[{iccid,status:'ONLINE',active:false}],'arya','2026-10-26');assert.equal(store.rows[0].classification,'Reserva');
});
test('codes verify exact identity and failures preserve saved data',async()=>{
 const f=fixture();f.data.imperatriz.rows=[{serial:'024000001',plate:'ABC1D23',apn:'old'}];
 await collect({...f,job:{kind:'codes',branch:'imperatriz'},service:{equipment:async()=>({ok:true,id:'1',serial:'024999999'})}});assert.equal(f.data.imperatriz.rows[0].collector_error.kind,'codes');assert.equal(f.data.imperatriz.rows[0].apn,'old');
 await collect({...f,job:{kind:'codes',branch:'imperatriz'},service:{equipment:async()=>({ok:true,id:'1',serial:'024000001',vehicle_id:'2',plate:'ABC1D23',apn:'hinova.br'})}});assert.equal(f.data.imperatriz.rows[0].code_scan.state,'confirmed');
});

test('costs use global scope, resume 100 ICCIDs and mark missing tariffs as partial',async()=>{
 const f=fixture(),ids=Array.from({length:101},(_,i)=>'89'+String(i).padStart(17,'0'));
 f.data.imperatriz.rows=ids.map((iccid,i)=>({serial:String(24000000+i),iccid,apn:'linksolutions.br'}));
 f.data.imperatriz.warehouse.providerSnapshots={link:{items:[],checked_at:new Date().toISOString()}};
 let batches=[];const service={aryaRequest:async()=> 'ICCID;STATUS;VALOR NEGOCIADO;OPERADORA\n'+iccid+';ATIVO;3,50;TIM',linkCostBatch:async batch=>{batches.push(batch);return batch.slice(0,batch.length===1?0:100).map(iccid=>({iccid,phase__name:'Vinculado',charge_start:'2026-01-01',item__base_price:'4.00'}));}};
 const job={kind:'costs',branch:'imperatriz'};
 await collect({...f,job,service});await collect({...f,job,service});assert.equal(f.data.imperatriz.warehouse.providerSnapshots['link-global'],undefined);
 assert.equal((await collect({...f,job,service})).finished,true);assert.deepEqual(batches.map(b=>b.length),[100,1]);
 const costs=f.data.imperatriz.warehouse.costs;assert.equal(costs.total_cents,40350);assert.equal(costs.complete,false);assert.equal(costs.missing_count,1);
});
test('bad equipment advances, credential failure keeps cursor for backoff',async()=>{
 const f=fixture();f.data.imperatriz.rows=[{serial:'024000001'},{serial:'024000002'}];const job={kind:'codes',branch:'imperatriz'};
 await collect({...f,job,service:{equipment:async()=>{throw Error('invalid')}}});assert.equal(f.data.imperatriz.collectors.codes.after,'024000001');
 await assert.rejects(collect({...f,job,service:{equipment:async()=>{throw Object.assign(Error('auth'),{credentialInvalid:true})}}}));assert.equal(f.data.imperatriz.collectors.codes.after,'024000001');
});
