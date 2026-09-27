export function fresh(value,now=Date.now(),limit=15*60*1000){const at=Date.parse(value);return Number.isFinite(at)&&at<=now+60000&&now-at<=limit;}
export function syncHealth(sync,now=Date.now()){
 if(!sync)return{label:'Sem informação',tone:'unknown'};
 if(!sync.enabled)return{label:'Pausada no servidor',tone:'warning'};
 if(!fresh(sync.last_tick,now,Math.max(10,Number(sync.interval_minutes)||5)*60000))return{label:'Sem sinal recente',tone:'warning'};
 if(Date.parse(sync.next_cycle_at)>now)return{label:'Aguardando próximo ciclo',tone:'good'};
 return{label:'Processando no servidor',tone:'good'};
}
export function sourceHealth(source,snapshot,manual,now=Date.now()){
 const alert=snapshot?.sync?.alerts?.find(a=>a.source===(['arya','link'].includes(source)?'carrier:'+source:source+':'+snapshot.branch));
 if(alert)return{label:'Acesso bloqueado',tone:'error',message:alert.message,at:alert.occurred_at};
 if(manual){if(!fresh(manual.checked_at,now))return{label:'Teste antigo',tone:'warning',at:manual.checked_at,message:'Faça um novo teste para confirmar.'};return{label:manual.ok?'Teste confirmado':'Teste falhou',tone:manual.ok?'good':'error',at:manual.checked_at,message:manual.ok?'Consulta manual respondida com sucesso.':manual.message};}
 const row=snapshot?.sources?.find(r=>r.source===source);
 if(!row)return{label:'Sem evidência recente',tone:'unknown',message:'Nenhuma consulta identificada para este serviço nas últimas 24 horas.'};
 const message=`${row.confirmed} de ${row.attempted} aparelhos com última consulta confirmada nas últimas 24 horas. Pendências de cadastro não comprovam queda da API.`;
 if(!fresh(row.checked_at,now))return{label:'Registro antigo',tone:'warning',at:row.checked_at,message};
 return{label:row.confirmed===row.attempted?'Consultas confirmadas':'Consultas com pendências',tone:row.confirmed===row.attempted?'good':'warning',at:row.checked_at,message};
}
