import test from 'node:test';
import assert from 'node:assert/strict';
import {filterStock,stockPageNumber} from '../public/stock-model.js';

test('invalid pagination cannot hide matching stock rows',()=>{
 for(const page of [NaN,undefined,'stock',-1,0,1.5,Infinity])assert.equal(stockPageNumber(page,35),1);
 assert.equal(stockPageNumber(4,7),1);
 assert.equal(stockPageNumber(4,35),4);
 assert.equal(stockPageNumber(4,0),1);
});
test('switching stock status returns installed rows and resets an out-of-range page',()=>{
 const devices=Array.from({length:27},(_,i)=>({id:String(i),serial:String(i).padStart(9,'0'),status:i<7?'Estoque':'Instalado'}));
 for(const [status,count] of [['Estoque',7],['Instalado',20],['Todos',27],['Estoque',7]]){
  const result=filterStock(devices,{status});assert.equal(result.rows.length,count);
  const page=stockPageNumber(1,result.rows.length);assert.ok(result.rows.slice((page-1)*10,page*10).length);
 }
});
