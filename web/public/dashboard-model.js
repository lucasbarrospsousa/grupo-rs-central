export function carrierSummary(rows,weighted=false) {
  const counts = new Map();
  for (const row of rows) {
    const raw = String(row.carrier || '').trim();
    const key = raw.toUpperCase().replace(/[\s_-]/g, '');
    const label = key.startsWith('MULTI') ? 'Multioperadora' : ({VIVO:'Vivo',CLARO:'Claro',TIM:'TIM',NLT:'NLT'})[key] || raw || 'Não informada';
    counts.set(label, (counts.get(label) || 0) + (weighted?Number(row.quantity)||0:1));
  }
  const total=[...counts.values()].reduce((a,b)=>a+b,0);
  return [...counts].map(([label,count])=>({label,count,percent:total?count/total*100:0})).sort((a,b)=>b.count-a.count || a.label.localeCompare(b.label));
}
export function stockSummary(rows) {
  return ['Estoque','Reserva','Instalado','Manutenção','Inativos'].map(label=>({label,count:rows.filter(r=>r.status===label).length}));
}
