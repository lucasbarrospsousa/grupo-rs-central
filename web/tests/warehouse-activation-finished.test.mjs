import test from 'node:test';import assert from 'node:assert/strict';
import {warehouseActivation} from '../backend/warehouse-activation.mjs';
const item={id:'qa',serial:'89999000000000000001',kind:'chip',chip_provider:'arya',status:'Disponível',classification:'Reserva',activation_state:null};
const csv=rows=>'ICCID;STATUS;VALOR NEGOCIADO;OPERADORA;NUMERO\n'+rows.map(r=>[r.serial,r.state,'1,00','VIVO',r.phone||''].join(';')).join('\n');
function fixture(rows,text){const writes=[],reads=[];const c={query:async(sql,p)=>{if(sql.startsWith('select *'))return {rows};if(sql.startsWith('update')){writes.push({sql,p});return {rowCount:1};}return {};}};const service={aryaRequest:async(path,p,opts)=>{reads.push(path);assert.equal(path,'/customer/inventary/export');assert.equal(opts?.write,undefined);if(text instanceof Error)throw text;return text;}};return {c,service,writes,reads};}
const check=f=>warehouseActivation(f.c,{body:{action:'check'},branch:'imperatriz',role:'admin',service:f.service});
test('manual no-batch chip becomes stock only on active evidence, preserving history',async()=>{
 const f=fixture([item,{...item,id:'used',status:'Utilizado'},{...item,id:'emergency',classification:'Emergência'}],csv([{...item,state:'ATIVO',phone:'5599999999999'}]));
 const r=await check(f);assert.equal(r.response.confirmed,1);assert.deepEqual(r.response.ids,['qa']);assert.equal(f.reads.length,1);assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].p.slice(0,2),['qa','5599999999999']);assert.match(f.writes[0].p[2],/^[a-f0-9-]{36}$/);assert.match(f.writes[0].sql,/activation_batch=coalesce\(activation_batch,/);
});
test('pending/missing stay unchanged; active never-connected is active; cache avoids repeated reads',async()=>{
 const rows=[item,{...item,id:'b',serial:'89999000000000000002'},{...item,id:'c',serial:'89999000000000000003'}];
 const f=fixture(rows,csv([{...rows[0],state:'PENDENTE'},{...rows[1],state:'ATIVO - NUNCA CONECTADO'}]));
 const r=await check(f);assert.equal(r.response.pending,1);assert.equal(r.response.errors,1);assert.deepEqual(r.response.ids,['b']);await check(f);assert.equal(f.reads.length,1);
});
test('malformed/failed exports and invalid phones produce zero writes; no candidates zero reads',async()=>{
 for(const response of [new Error('Timeout'),'invalid',csv([{...item,state:'ATIVO',phone:'bad'}])]){const f=fixture([item],response);await assert.rejects(check(f));assert.equal(f.writes.length,0);}
 const f=fixture([],'invalid');await check(f);assert.equal(f.reads.length,0);
});
