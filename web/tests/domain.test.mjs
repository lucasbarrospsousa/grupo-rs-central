import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoRepository, branches, canonicalSerial, generation, classifyBinding, filterVehicles } from '../public/domain.js';

test('series takes numeric canonical fields, preserving zero and rejecting plate', () => {
  assert.equal(canonicalSerial({ equipment_number:'XRS - 008', imei:'024295425' }), '024295425');
  assert.equal(canonicalSerial({ equipment_number:'XRS - 008' }), '');
  assert.equal(generation('024000001'),'4G'); assert.equal(generation('807000001'),'2G'); assert.equal(generation(''),null);
});
test('query failures, ambiguous bindings and stock identifiers never become eligible', () => {
  const serial = '024000001';
  assert.equal(classifyBinding(serial,{state:'error'}).state,'error');
  assert.equal(classifyBinding(serial,{rows:[{serial:'024000002',plate:'DEM1A01',client:'Demo'}]}).state,'review');
  assert.equal(classifyBinding(serial,{rows:[{serial,plate:'XRS - 008',client:'RS300'}]}).state,'stock');
  assert.equal(classifyBinding(serial,{rows:[{serial,plate:'DEM1A01',client:''}]}).state,'review');
  assert.equal(classifyBinding(serial,{rows:[{serial},{serial}]}).state,'review');
});
test('filters combine APN, generation and search', () => {
  const repo = new DemoRepository();
  const result = filterVehicles(repo.vehicles,{gen:'4G',apn:'hinova',search:'024'});
  assert.ok(result.length); assert.ok(result.every(v => v.apn === 'hinova' && v.serial.startsWith('024')));
});
for (const branch of branches) test(`batch discharge is isolated, revalidated and not duplicated: ${branch.id}`, () => {
  const repo = new DemoRepository(); const others = JSON.stringify(repo.devices.filter(d => d.branch !== branch.id));
  const selected = repo.analyze(branch.id).filter(d => d.state === 'eligible'); assert.equal(selected.length,3);
  const outcome = repo.applyDischarge(branch.id, selected); assert.equal(outcome.filter(o => o.ok).length,3);
  assert.equal(repo.applyDischarge(branch.id,selected).filter(o => o.ok).length,0);
  assert.equal(repo.movements.length,3); assert.equal(JSON.stringify(repo.devices.filter(d => d.branch !== branch.id)),others);
});
test('stale version, wrong branch or changed binding blocks discharge', () => {
  const repo = new DemoRepository(); const selected = repo.analyze('imperatriz').filter(d => d.state === 'eligible');
  repo.devices.find(d => d.id === selected[0].id).version++;
  assert.equal(repo.applyDischarge('imperatriz',[selected[0]])[0].ok,false);
  assert.equal(repo.applyDischarge('maraba',[selected[1]])[0].ok,false);
  selected[1].plate='ABC1D23'; assert.equal(repo.applyDischarge('imperatriz',[selected[1]])[0].ok,false);
  assert.equal(repo.movements.length,0);
});
test('chip requires exact confirmed ICCID; duplicate and invalid series rejected', () => {
  const repo = new DemoRepository(); const iccid = '8955300000000000099';
  assert.throws(() => repo.addWarehouse('chip',iccid),/Arya/);
  assert.throws(() => repo.addWarehouse('chip',iccid,{state:'found',iccid:'8955300000000000098'}),/Arya/);
  repo.addWarehouse('chip',iccid,{state:'found',iccid}); assert.equal(repo.warehouse.at(-1).serial,iccid);
  assert.throws(() => repo.addWarehouse('chip',iccid,{state:'found',iccid}),/já está/);
  assert.throws(() => repo.addWarehouse('device','XRS - 008'),/Confira/);
});
test('transfer revalidates all selected items before any update', () => {
  const repo = new DemoRepository(); repo.warehouse[1].status='Enviado';
  assert.throws(() => repo.transfer(['warehouse-0','warehouse-1'],'Marabá'),/disponibilidade/);
  assert.equal(repo.warehouse[0].status,'Disponível'); assert.equal(repo.movements.length,0);
  repo.transfer(['warehouse-0'],'Destino externo'); assert.equal(repo.warehouse[0].destination,'Destino externo');
  assert.throws(() => repo.removeWarehouse('warehouse-0'),/disponíveis/);
});
test('replacement report validates before mutation and repeated report never duplicates discharge', () => {
  const repo = new DemoRepository(); const report = {id:'report-1',branch:'imperatriz',vehicle:repo.vehicles[0].id,reason:'Troca de aparelho',medium:'Consultor informou',replacement:'maraba-8'};
  assert.throws(() => repo.saveReport(report),/disponível/); assert.equal(repo.reports.length,0); assert.equal(repo.movements.length,0);
  report.replacement='imperatriz-8'; repo.saveReport(report); repo.saveReport(report);
  assert.equal(repo.reports.length,1); assert.equal(repo.movements.length,1);
  assert.equal(repo.devices.find(d => d.id === report.replacement).status,'Instalado');
  assert.throws(() => repo.saveReport({...report,id:'report-2'}),/disponível/); assert.equal(repo.reports.length,1);
});
test('new session resets all demo changes and warehouse removal is recorded', () => {
  const repo = new DemoRepository(); repo.removeWarehouse('warehouse-0');
  assert.equal(repo.warehouse.length,11); assert.equal(repo.movements[0].type,'Remoção');
  assert.equal(new DemoRepository().warehouse.length,12);
});
