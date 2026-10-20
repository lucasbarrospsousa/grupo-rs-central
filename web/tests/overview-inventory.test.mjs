import test from 'node:test';
import assert from 'node:assert/strict';
import {overviewSummary,donut,lineChart} from '../public/overview-summary.js';
import {carrierSummary} from '../public/dashboard-model.js';
import {selectWarehouseView} from '../backend/warehouse-view.mjs';
test('chip distribution uses available warehouse chips, never device operators or used chips',()=>{
 const rows=[{kind:'chip',status:'Disponível',classification:'Estoque',chip_operator:'TIM'},{kind:'chip',status:'Disponível',classification:'Reserva',chip_operator:'tim'},{kind:'chip',status:'Utilizado',chip_operator:'Vivo'},{kind:'device',status:'Disponível',chip_operator:'Claro'}].map((r,i)=>({...r,id:String(i),serial:String(i),received_at:'2026-10-01'}));
 const r=selectWarehouseView({rows,movements:[]},new URLSearchParams({view:'overview',month:'2026-10'}));assert.deepEqual(r.carriers,[{label:'TIM',count:2,percent:100}]);assert.equal(r.counts.chip.Estoque,1);assert.equal(r.counts.chip.Reserva,1);assert.equal(r.counts.device.total,1);
});
test('weighted SQL groups normalize names and preserve unknown carriers without expanding rows',()=>{assert.deepEqual(carrierSummary([{carrier:'TIM',quantity:3},{carrier:'tim',quantity:2},{carrier:'',quantity:5}],true),[{label:'Não informada',count:5,percent:50},{label:'TIM',count:5,percent:50}]);});
test('overview preserves real zeros and unavailable values separately and escapes labels',()=>{
 const html=overviewSummary({statuses:[{label:'Estoque',count:7},{label:'Reserva',count:0},{label:'Manutenção',count:2}]},'<unsafe>',()=>'',{allowed:false});assert.match(html,/Aparelhos em estoque/);assert.match(html,/>7<\/strong>/);assert.match(html,/>0<\/strong>/);assert.match(html,/Sem acesso/);assert.ok(!html.includes('<unsafe>'));assert.equal((html.match(/<article /g)||[]).length,6);
 const loading=overviewSummary({statuses:[]},'Base',()=>'',{allowed:true});assert.match(loading,/Carregando distribuição/);assert.match(loading,/Chips em estoque[\s\S]*?<strong>—<\/strong>/);
});
test('charts expose keyboard tooltips and zero-safe daily values without accumulation',()=>{
 const chart=lineChart([{day:1,key:'2026-10-01',counts:[2,3]},{day:2,key:'2026-10-02',counts:[1]}]);assert.match(chart,/2026-10-01: 5 baixas/);assert.match(chart,/2026-10-02: 1 baixas/);assert.match(chart,/tabindex="0"/);assert.ok(!chart.includes('NaN'));assert.match(donut([]),/Nenhum chip/);assert.ok(!donut([{label:'<img>',count:2}]).includes('<img>'));
});
