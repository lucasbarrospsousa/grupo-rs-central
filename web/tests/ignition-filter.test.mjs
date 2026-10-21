import test from 'node:test';import assert from 'node:assert/strict';
import {communicationFilter} from '../public/communication-state.js';
import {pageOptions,selectDevicePage} from '../backend/device-page.mjs';
test('ignition filtering distinguishes stale/sleep and unknown, validates enum and filters before pagination',()=>{
 const now=Date.now(),sample=(ignition,age,extra={})=>({ok:true,ignition,updated_at:new Date(now-age).toISOString(),...extra});
 for(const [value,want] of [[sample(true,1000),'on'],[sample(false,1000),'off'],[sample(true,900001),'stale'],[sample(false,7200001,{internal_battery:40}),'stale'],[sample(false,1000,{query_error:'Falha'}),'unknown'],[null,'unknown'],[sample(true,-600000),'unknown']])assert.equal(communicationFilter(value,now),want);
 const rows=Array.from({length:35},(_,i)=>({serial:String(i).padStart(8,'0'),status:'Estoque',observation:{location:sample(i<23,1000)}}));
 const result=selectDevicePage(rows,'imperatriz',pageOptions(new URLSearchParams({ignition:'off',page:'2'})));assert.equal(result.total,12);assert.equal(result.rows.length,2);assert.equal(result.rows[0].serial,'00000033');
 assert.throws(()=>pageOptions(new URLSearchParams({ignition:'injected'})));
});
