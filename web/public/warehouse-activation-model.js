export const activationLabels={prepared:'Lote preparado',requested:'Ativação solicitada',active:'Ativo confirmado'};
export const reserveChip=r=>r.kind==='chip'&&r.status==='Disponível'&&(r.classification==='Reserva'||!r.chip_phone||r.activation_state);
export const activationCandidate=r=>reserveChip(r)&&r.chip_provider==='arya'&&!r.activation_state;
export function activationSelection(rows,ids,size){
 if(![10,20].includes(size)||!Array.isArray(ids)||!ids.length||ids.length>size||new Set(ids).size!==ids.length)throw Error('Selecione de 1 a '+size+' chips distintos.');
 const chosen=ids.map(id=>rows.find(r=>r.id===id));
 if(chosen.some(r=>!r||!activationCandidate(r)))throw Error('Há chips indisponíveis ou com ativação já reservada/solicitada. Atualize a lista.');
 return chosen;
}
