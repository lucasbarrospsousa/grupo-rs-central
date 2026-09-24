import test from 'node:test';
import assert from 'node:assert/strict';
import {filterStock,stockRows,visibleStatus,csvText} from '../public/stock-model.js';
const rows=stockRows([
  {id:'a',serial:'024000001',plate:'ABC1D23',status:'Instalado',carrier:'Claro',updated_at:'2026-09-20T12:00:00',installed_at:'2026-09-10T10:00:00',phone:'559900000000',iccid:'8955300000000000099'},
  {id:'b',serial:'024000002',status:'Reserva',carrier:'Vivo',updated_at:'2026-09-21T12:00:00'},
  {id:'c',serial:'024000010',status:'Estoque',updated_at:'',installed_at:'2026-09-22T12:00:00'}
]);
test('stock multiple series lookup is exact, deduplicated and reports missing items',()=>{
  const r=filterStock(rows,{query:'024000001;024000001;02400001;'});
  assert.equal(r.requested,2);assert.equal(r.rows.length,1);assert.deepEqual(r.missing,['02400001']);
});
test('stock text search includes plate, phone, chip and carrier',()=>{
  for(const query of ['ABC1D23','559900000000','8955300000000000099','claro'])assert.equal(filterStock(rows,{query}).rows[0].id,'a');
});
test('regional reserve maps to stock without changing original row',()=>{
  assert.equal(visibleStatus(rows[1],'araguaina'),'Estoque');assert.equal(visibleStatus(rows[1],'imperatriz'),'Reserva');
  assert.equal(filterStock(rows,{branch:'araguaina',status:'Estoque'}).rows.length,2);assert.equal(rows[1].status,'Reserva');
});
test('stock period uses update date inclusively, not installation, excludes unknown dates',()=>{
  assert.deepEqual(filterStock(rows,{start:'2026-09-20',end:'2026-09-20'}).rows.map(r=>r.id),['a']);
  assert.throws(()=>filterStock(rows,{start:'2026-09-22',end:'2026-09-21'}),/anterior/);
  assert.equal(filterStock(rows,{start:'2026-09-22'}).rows.length,0);
});
test('installation sorting puts missing dates last and does not mutate source order',()=>{
  assert.deepEqual(filterStock(rows).rows.map(r=>r.id),['c','a','b']);assert.deepEqual(rows.map(r=>r.id),['a','b','c']);
});
test('CSV escapes quotes and formula cells',()=>{
  const csv=csvText([{serial:'024000001',identification:'=HYPERLINK("example")'}]);
  assert.ok(csv.includes('"024000001"'));assert.ok(csv.includes('"\'=HYPERLINK(""example"")"'));
});
