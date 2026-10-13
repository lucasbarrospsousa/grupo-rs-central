import test from 'node:test';import assert from 'node:assert/strict';
import {activationSelection,activationCandidate,reserveChip} from '../public/warehouse-activation-model.js';
import {warehouseActivation} from '../backend/warehouse-activation.mjs';
import {permitted} from '../backend/user-access.mjs';
const rows=Array.from({length:21},(_,i)=>({id:String(i),kind:'chip',status:'Disponível',classification:'Reserva',chip_provider:'arya',chip_phone:''}));
test('lotes de 10/20, último lote menor, duplicados e limites',()=>{
 for(const n of [1,10,20])assert.equal(activationSelection(rows,rows.slice(0,n).map(r=>r.id),n===20?20:10).length,n);
 assert.throws(()=>activationSelection(rows,rows.map(r=>r.id),20));assert.throws(()=>activationSelection(rows,['0','0'],10));assert.throws(()=>activationSelection(rows,['0'],15));
 for(const activation_state of ['prepared','requested','active'])assert.equal(activationCandidate({...rows[0],activation_state}),false);
 assert.equal(activationCandidate({...rows[0],chip_provider:'link'}),false);assert.equal(activationCandidate({...rows[0],status:'Utilizado'}),false);
 assert.equal(reserveChip({...rows[0],classification:'Estoque'}),true);
});
test('permissões e filial bloqueiam antes de consultar a operadora',async()=>{
 const c={query:()=>{throw Error('Não deve consultar');}};
 for(const [branch,role] of [['maraba','admin'],['imperatriz','reader'],['imperatriz','operator']])await assert.rejects(warehouseActivation(c,{body:{action:'prepare'},branch,role}),{status:403});
 assert.equal(permitted({owner:false,views:['warehouse'],writes:[]},'/api/warehouse-activation','POST'),false);
 assert.equal(permitted({owner:false,views:['warehouse'],writes:['warehouse']},'/api/warehouse-activation','POST'),true);
});
