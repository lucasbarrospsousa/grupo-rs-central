export function communicationTime(value){
 let text=String(value||'').trim().replace(' ','T');
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)&&!/(Z|[+-]\d{2}:?\d{2})$/i.test(text))text+='-03:00';
 return Date.parse(text);
}
export function communicationAge(sample,now=Date.now()){
 const at=communicationTime(sample?.updated_at);if(!Number.isFinite(at)||at>now+300000)return '';
 const seconds=Math.max(0,Math.floor((now-at)/1000));
 return seconds<60?seconds+' s':seconds<3600?Math.floor(seconds/60)+' min':seconds<86400?Math.floor(seconds/3600)+' h':Math.floor(seconds/86400)+' d';
}
export function ignitionLabel(value){return /^(1|true|on|ligad[oa])$/i.test(String(value))?'Ligado':/^(0|false|off|desligad[oa])$/i.test(String(value))?'Desligado':'Não informado';}
export function communication(sample,now=Date.now()){
 if(!sample?.ok)return sample?.message?'Consulta pendente':'Não consultado';
 const age=communicationAge(sample,now);if(!age)return 'Conferir horário';
 const stale=sample.query_error||now-communicationTime(sample.updated_at)>300000;
 return (stale?'Sem atualização':ignitionLabel(sample.ignition)==='Não informado'?'Ignição desconhecida':ignitionLabel(sample.ignition))+' · há '+age;
}
// Preserve confirmed data after a failed read or a late, older response.
export function latestCommunication(previous,next){
 if(previous?.serial&&next?.serial&&previous.serial!==next.serial)return next;
 if(!next?.ok)return previous?.ok?{...previous,pending:false,query_error:next?.message||'Consulta pendente'}:next;
 const before=communicationTime(previous?.updated_at),after=communicationTime(next.updated_at);
 const oldEvent=communicationTime(previous?.gps_at),newEvent=communicationTime(next.gps_at);
 if(previous?.ok&&((Number.isFinite(before)&&(!Number.isFinite(after)||after<before))||(Number.isFinite(oldEvent)&&Number.isFinite(newEvent)&&newEvent<oldEvent)))return {...previous,pending:false};
 return {...next,pending:false,query_error:''};
}
