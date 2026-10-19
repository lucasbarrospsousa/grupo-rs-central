export const copyCandidate=r=>r?.kind==='chip'&&typeof r.serial==='string'&&/^\d{10,24}$/.test(r.serial);
export function selectedIccids(rows,ids){
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length)throw Error('Selecione os chips para copiar.');
 const chosen=ids.map(id=>rows.find(r=>r.id===id));
 if(chosen.some(r=>!copyCandidate(r)))throw Error('A seleção mudou. Selecione novamente.');
 const values=chosen.map(r=>r.serial);
 if(new Set(values).size!==values.length)throw Error('ICCID repetido na seleção. Confira os registros.');
 return values.join(';');
}
export async function copySelectedIccids(rows,ids,clipboard=globalThis.navigator?.clipboard){
 const text=selectedIccids(rows,[...ids]);
 if(!clipboard?.writeText)throw Error('Cópia indisponível neste navegador.');
 await clipboard.writeText(text);return ids.length;
}
