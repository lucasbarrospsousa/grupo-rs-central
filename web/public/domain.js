export const branches = [
  { id: 'imperatriz', name: 'Imperatriz' }, { id: 'araguaina', name: 'Araguaína' },
  { id: 'acailandia', name: 'Açailândia' }, { id: 'maraba', name: 'Marabá' }
];
export const generation = serial => !serial ? null : String(serial).startsWith('024') ? '4G' : '2G';
export const validSerial = value => /^\d{9}$/.test(value);
export const validIccid = value => /^89\d{17,18}$/.test(value);
export function canonicalSerial(product) {
  return [product.imei, product.sku, product.serial, product.equipment_number].find(v => typeof v === 'string' && /^\d{6,17}$/.test(v)) || '';
}
export function classifyBinding(serial, response) {
  if (response.state === 'error') return { state: 'error', label: 'Falha na consulta' };
  const rows = (response.rows || []).filter(row => row.serial === serial);
  if (rows.length !== 1) return { state: 'review', label: 'Conferir vínculo' };
  const row = rows[0];
  if (row.client === 'RS300' && /^(AAA|GRS|XRS|NOV)[\s-]*\d+$/i.test(row.plate)) return { state: 'stock', label: 'Permanece em estoque', ...row };
  if (!row.client || row.client === 'RS300' || !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(row.plate.replace(/[\s-]/g, ''))) return { state: 'review', label: 'Conferir vínculo', ...row };
  return { ...row, state: 'eligible', label: 'Apto para baixa' };
}
export function filterVehicles(rows, { search = '', apn = '', gen = '' } = {}) {
  const text = search.toLocaleLowerCase('pt-BR');
  return rows.filter(r => (!apn || r.apn === apn) && (!gen || generation(r.serial) === gen) &&
    [r.serial, r.plate, r.client].some(v => String(v).toLocaleLowerCase('pt-BR').includes(text)));
}

// Replace this adapter only after database authorization. All state is volatile.
export class DemoRepository {
  constructor() {
    this.devices = branches.flatMap((b, bi) => Array.from({ length: 14 }, (_, i) => ({
      id: `${b.id}-${i}`, branch: b.id, serial: `${i % 4 ? '024' : '807'}${String(bi * 100 + i).padStart(6, '0')}`,
      plate: i < 8 ? `DEM${i}A${String(bi).padStart(2, '0')}` : `XRS - ${i}`,
      client: i < 8 ? `Cliente de demonstração ${bi + 1}.${i + 1}` : 'RS300',
      status: i < 8 ? 'Instalado' : i < 13 ? 'Estoque' : 'Manutenção', carrier: ['Vivo', 'Claro', 'TIM', 'Multioperadora'][i % 4], version: 1
    })));
    this.vehicles = branches.flatMap((b, bi) => Array.from({ length: [24, 18, 12, 8][bi] }, (_, i) => ({
      id: `vehicle-${b.id}-${i}`, branch: b.id, serial: `${i % 3 ? '024' : '807'}${String(8000 + bi * 100 + i).padStart(6, '0')}`,
      client: `Cliente demonstrativo ${String(i + 1).padStart(2, '0')}`, plate: `DEM${i % 10}B${String(i).padStart(2, '0')}`,
      apn: i % 3 ? 'hinova' : 'multi', phone: 'Não informado', last: '21/09/2026 14:20'
    })));
    this.warehouse = Array.from({ length: 12 }, (_, i) => ({ id: `warehouse-${i}`, kind: i < 8 ? 'device' : 'chip',
      serial: i < 8 ? `0249000${String(i).padStart(2, '0')}` : `895530000000000000${i - 8}`,
      status: 'Disponível', received: '24/09/2026', version: 1 }));
    this.reports = []; this.movements = []; this.applied = new Set();
  }
  list(branch) { return this.devices.filter(d => d.branch === branch).map(d => ({ ...d })); }
  analyze(branch) {
    return this.list(branch).filter(d => d.status === 'Estoque').map(d => {
      const i = Number(d.id.split('-').at(-1)) - 8;
      return { ...d, ...classifyBinding(d.serial, i === 4 ? { state: 'error' } : { rows: [{ serial: d.serial, plate: i < 3 ? `DEM${i}C01` : d.plate, client: i < 3 ? `Cliente demonstrativo ${i + 1}` : 'RS300' }] }) };
    });
  }
  applyDischarge(branch, snapshots) {
    const outcomes = [];
    for (const snap of snapshots) {
      const current = this.devices.find(d => d.id === snap.id && d.branch === branch);
      const fresh = this.analyze(branch).find(d => d.id === snap.id);
      if (!current || !fresh || snap.state !== 'eligible' || fresh.state !== 'eligible' || current.version !== snap.version || fresh.plate !== snap.plate || fresh.client !== snap.client) {
        outcomes.push({ id: snap.id, ok: false }); continue;
      }
      // In production: one authorized server transaction per operation.
      current.status = 'Instalado'; current.plate = fresh.plate; current.client = fresh.client; current.version++;
      this.record('Baixa', current.serial, branches.find(b => b.id === branch).name);
      outcomes.push({ id: snap.id, ok: true });
    }
    return outcomes;
  }
  addWarehouse(kind, serial, verification) {
    serial = serial.trim();
    if (!['device', 'chip'].includes(kind) || !(kind === 'device' ? validSerial(serial) : validIccid(serial))) throw Error('Confira o número completo e mantenha os zeros iniciais.');
    if (this.warehouse.some(d => d.serial === serial && d.kind === kind)) throw Error('Este item já está no Armazém.');
    if (kind === 'chip' && (verification?.state !== 'found' || verification.iccid !== serial)) throw Error('Cadastro bloqueado até a Arya confirmar o ICCID.');
    this.warehouse.push({ id: crypto.randomUUID(), kind, serial, status: 'Disponível', received: new Date().toLocaleDateString('pt-BR'), version: 1 });
    this.record('Entrada', serial, 'Armazém');
  }
  transfer(ids, destination, note = '') {
    if (!destination?.trim() || !ids.length || new Set(ids).size !== ids.length) throw Error('Selecione itens e informe o destino.');
    const items = ids.map(id => this.warehouse.find(d => d.id === id));
    if (items.some(d => !d || d.status !== 'Disponível')) throw Error('A disponibilidade mudou. Revise a seleção.');
    items.forEach(d => { d.status = 'Enviado'; d.destination = destination.trim(); d.note = note; d.version++; this.record('Envio', d.serial, destination, note); });
  }
  removeWarehouse(id) {
    const item = this.warehouse.find(d => d.id === id);
    if (!item || item.status !== 'Disponível') throw Error('Somente itens disponíveis podem ser removidos.');
    this.warehouse = this.warehouse.filter(d => d.id !== id); this.record('Remoção', item.serial, 'Armazém');
  }
  saveReport(report) {
    if (this.reports.some(r => r.id === report.id)) return;
    const vehicle = this.vehicles.find(v => v.id === report.vehicle && v.branch === report.branch);
    if (!vehicle) throw Error('Selecione um veículo da filial.');
    if (!['Sem comunicação', 'Localização errada', 'Troca de aparelho'].includes(report.reason) || !['App de rastreamento', 'Suporte do rastreio', 'Consultor informou'].includes(report.medium)) throw Error('Informe motivo e meio.');
    const replacement = this.devices.find(d => d.id === report.replacement && d.branch === report.branch && d.status === 'Estoque');
    if (report.reason === 'Troca de aparelho' && !replacement) throw Error('Selecione um aparelho disponível na filial.');
    if (report.reason === 'Troca de aparelho') {
      replacement.status = 'Instalado'; replacement.plate = vehicle.plate; replacement.client = vehicle.client; replacement.version++;
      this.record('Baixa por relatório', replacement.serial, report.branch);
    }
    this.reports.push({ ...report, client: vehicle.client, plate: vehicle.plate, currentSerial: vehicle.serial, date: new Date().toLocaleDateString('pt-BR') });
  }
  record(type, serial, destination, note = '') { this.movements.unshift({ type, serial, destination, note, at: new Date().toLocaleString('pt-BR') }); }
}
