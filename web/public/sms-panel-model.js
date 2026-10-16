export const smsLabels={queued:'Na fila',waiting_gateway:'Aguardando Galaxy',pending:'Aguardando retorno',received:'Recebido pelo Galaxy',sending:'Enviando',sent:'SMS enviado',delivered:'Entrega confirmada',failed:'Falhou',cancelled:'Cancelado',expired:'Expirado',indeterminate:'Conferência necessária',needs_confirmation:'Conferência necessária'};
export const smsInProgress=r=>['queued','waiting_gateway','pending','received','sending'].includes(r.state);
export const smsAttention=r=>['failed','expired','indeterminate','needs_confirmation'].includes(r.state);
export function smsCounts(rows){return [rows.filter(smsInProgress).length,rows.filter(r=>['sent','delivered'].includes(r.state)).length,rows.filter(r=>r.state==='delivered').length,rows.filter(smsAttention).length];}
export function smsResultRows(rows,query='',filter='all'){
 const q=query.trim().toLowerCase(),digits=q.replace(/\D/g,'');
 return rows.filter(r=>!smsInProgress(r)).filter(r=>filter==='all'||(filter==='attention'?smsAttention(r):r.state===filter)).filter(r=>!q||[r.serial,r.payload?.phone].some(v=>String(v||'').toLowerCase().includes(q))||(digits&&/^[+()\s\d.-]+$/.test(q)&&String(r.payload?.phone||'').replace(/\D/g,'').includes(digits)));
}
export function smsCommandName(r){const p=r.payload||{};return p.command_mode==='standard'?'Configuração padrão':p.command==='reset,123456'?'Reiniciar':p.command==='locache,123456,1'?'Limpar memória':'Personalizado';}
export const smsTone=r=>r.state==='delivered'?'green':r.state==='failed'?'red':smsAttention(r)?'amber':r.state==='cancelled'?'gray':'blue';
