// Port of inventory search/date rules; no network or persistence.
export const statuses = ['Todos', 'Estoque', 'Reserva', 'Instalado', 'Manutenção', 'Inativos'];
export function visibleStatus(row, branch) {
  return branch !== 'imperatriz' && row.status === 'Reserva' ? 'Estoque' : row.status;
}
export function stockRows(rows) {
  return rows.map((r, i) => ({
    identification: `AAA - ${331 + i}`, model: 'V7.2.2/7.1.6',
    connectivity: i % 3 === 2 ? 'Off' : 'Online',
    communication: ['Atualizado', 'Desligado', 'Possível GPS'][i % 3],
    installed_at: r.status === 'Instalado' ? `2026-09-${String(23 - Math.floor(i / 3)).padStart(2, '0')}T${String(18 - i % 3).padStart(2, '0')}:30:00` : '',
    updated_at: `2026-09-${String(23 - i % 5).padStart(2, '0')}T12:00:00`,
    phone: '', iccid: '', ...r
  }));
}
export function filterStock(rows, { query = '', status = 'Todos', start = '', end = '', branch = 'imperatriz', sort = 'default', direction = -1 } = {}) {
  if (start && end && start > end) throw Error('A data final não pode ser anterior à data inicial.');
  const batch = /[;\r\n]/.test(query);
  const wanted = [...new Set(query.split(/[;\r\n]+/).map(s => s.trim()).filter(Boolean))];
  const text = query.trim().toLocaleLowerCase('pt-BR');
  const matched = rows.filter(r => batch ? wanted.includes(r.serial) :
    [r.serial, r.identification, r.plate, r.phone, r.iccid, r.carrier, r.client].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(text)));
  const filtered = matched.filter(r => {
    // Same priority as _inventory_product_date; period is NOT installation date.
    const date = (r.updated_at || r.created_at || r.source_date || r.purchase_date || r.date || '').slice(0,10);
    return (status === 'Todos' || visibleStatus(r, branch) === status) && (!(start || end) || (date && (!start || date >= start) && (!end || date <= end)));
  });
  const rank={Estoque:0,Reserva:1,'Manutenção':2,Instalado:3,Inativos:4,Inativo:4};
  const installationTime=r=>{const value=Date.parse(r.installed_at||'');return Number.isFinite(value)?value:null;};
  filtered.sort((a,b) => {
    if(sort==='default'){
      if(status==='Todos'){const group=(rank[a.status]??5)-(rank[b.status]??5);if(group)return group;}
      if(a.status==='Instalado'&&b.status==='Instalado'){
        const at=installationTime(a),bt=installationTime(b);
        if(at===null&&bt!==null)return 1;if(at!==null&&bt===null)return -1;
        if(at!==null&&bt!==null&&at!==bt)return bt-at;
      }
      return a.serial.localeCompare(b.serial,'pt-BR',{numeric:true});
    }
    const av = String(a[sort] || ''), bv = String(b[sort] || '');
    if (!av && bv) return 1; if (av && !bv) return -1;
    return av.localeCompare(bv,'pt-BR',{numeric:true}) * direction || a.serial.localeCompare(b.serial);
  });
  return { rows: filtered, batch, requested: wanted.length, found: matched.length,
    missing: batch ? wanted.filter(s => !matched.some(r => r.serial === s)) : [] };
}
export function csvText(rows) {
  const cell = v => { let s = String(v ?? ''); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"','""') + '"'; };
  return '\ufeff' + [['Série','Identificação','Veículo','Tipo','Operadora','Status','Conectividade','Instalação'], ...rows.map(r => [r.serial,r.identification,r.plate,r.model,r.carrier,r.status,r.connectivity,r.installed_at])].map(row => row.map(cell).join(';')).join('\r\n');
}
