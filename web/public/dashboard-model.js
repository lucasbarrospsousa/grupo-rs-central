export function carrierSummary(rows) {
  const counts = new Map();
  for (const row of rows) {
    const raw = String(row.carrier || '').trim();
    const key = raw.toUpperCase().replace(/[\s_-]/g, '');
    const label = key.startsWith('MULTI') ? 'Multioperadora' : ({VIVO:'Vivo',CLARO:'Claro',TIM:'TIM',NLT:'NLT'})[key] || raw || 'Não informada';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts].map(([label,count])=>({label,count,percent:rows.length?count/rows.length*100:0})).sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
}
export function stockSummary(rows) {
  return ['Estoque','Reserva','Instalado','Manutenção','Inativos'].map(label=>({label,count:rows.filter(r=>r.status===label).length}));
}
