// Rules mirrored from active Central web communication/GPS status.
function communicationTime(value){
 let text=String(value||'').trim().replace(' ','T');
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)&&!/(Z|[+-]\d{2}:?\d{2})$/i.test(text))text+='-03:00';
 return Date.parse(text);
}
function communicationAge(sample,now=Date.now()){
 const at=communicationTime(sample?.updated_at);if(!Number.isFinite(at)||at>now+300000)return '';
 const seconds=Math.max(0,Math.floor((now-at)/1000));
 return seconds<60?seconds+' s':seconds<3600?Math.floor(seconds/60)+' min':seconds<86400?Math.floor(seconds/3600)+' h':Math.floor(seconds/86400)+' d';
}
function ignitionLabel(value){return /^(1|true|on|ligad[oa])$/i.test(String(value))?'Ligado':/^(0|false|off|desligad[oa])$/i.test(String(value))?'Desligado':'Não informado';}
// Reporting cadence: on 1 min, off 1 hour; these are tolerance limits, not polling intervals.
function communicationStatus(sample,now=Date.now()){
 if(!sample?.ok)return {state:'unknown',tone:'neutral',label:sample?.message?'Sem atualização da API':'Não consultado'};
 const age=communicationAge(sample,now);
 if(!age)return {state:'unknown',tone:'neutral',label:sample.query_error?'Sem atualização da API':'Conferir horário'};
 const ignition=ignitionLabel(sample.ignition),limit=ignition==='Ligado'?900000:ignition==='Desligado'?7200000:null;
 const stale=limit!==null&&now-communicationTime(sample.updated_at)>limit;
 const battery=String(sample.internal_battery??'').trim();
 const possibleSleep=stale&&ignition==='Desligado'&&battery!==''&&Number.isFinite(Number(battery))&&Number(battery)>=0&&Number(battery)<75;
 const state=possibleSleep?'sleep':stale?'stale':ignition==='Ligado'?'on':ignition==='Desligado'?'off':'unknown';
 const label=possibleSleep?'sleep mode':stale?'Desatualizado':ignition==='Não informado'?'Ignição desconhecida':ignition;
 return {state:sample.query_error?'unknown':state,tone:sample.query_error?'neutral':possibleSleep?'sleep':stale?'warning':state==='on'?'success':state==='off'?'danger':'neutral',label:sample.query_error?'Sem atualização da API · último estado: '+label:label,age,stale,possibleSleep,limit};
}
function communication(sample,now=Date.now()){
 const status=communicationStatus(sample,now);
 return status.label+(status.age?' · há '+status.age:'');
}
const validPoint=r=>r.lat!==null&&r.lng!==null&&r.lat!==''&&r.lng!==''&&Number.isFinite(+r.lat)&&Number.isFinite(+r.lng)&&Math.abs(+r.lat)<=90&&Math.abs(+r.lng)<=180&&(+r.lat!==0||+r.lng!==0);
const time=v=>{let s=String(v||'').trim().replace(' ','T');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)&&!/(Z|[+-]\d{2}:?\d{2})$/i.test(s))s+='-03:00';return Date.parse(s);};
function gpsStatus(loc,now=Date.now()){
 if(!loc?.ok)return{tone:'neutral',label:'Sem análise',detail:'Comunicação não confirmada.'};
 const received=time(loc.updated_at),gps=time(loc.gps_at);
 if(!Number.isFinite(received))return{tone:'neutral',label:'Dados insuficientes',detail:'Data de comunicação não informada.'};
 if(received>now+300000||gps>now+300000)return{tone:'warning',label:'Conferir horário',detail:'Horário recebido está no futuro.'};
 const status=communicationStatus(loc,now);
 if(loc.query_error)return{tone:'neutral',label:'Sem atualização da API',detail:'Últimos dados preservados; GPS atual não confirmado.'};
 if(status.stale)return{tone:'warning',label:'Comunicação antiga',detail:status.possibleSleep?'sleep mode; GPS não conclusivo.':'Limite da última ignição excedido; GPS não conclusivo.'};
 if(status.limit===null)return{tone:'neutral',label:'Dados insuficientes',detail:'Ignição desconhecida; intervalo de comunicação não confirmado.'};
 if(String(loc.gps_signal)==='0')return{tone:'warning',label:'Possível perda de GPS',detail:'Última comunicação informa ausência de sinal GPS.'};
 if(!validPoint(loc))return{tone:'warning',label:'Posição inválida',detail:'Coordenadas ausentes ou inválidas na comunicação.'};
 if(!Number.isFinite(gps))return{tone:'neutral',label:'Dados insuficientes',detail:'Data da posição GPS não informada.'};
 if(received-gps>900000)return{tone:'warning',label:'GPS desatualizado',detail:'A posição está mais de 15 min atrás da comunicação.'};
 if(String(loc.gps_signal)!=='1')return{tone:'neutral',label:'Posição disponível',detail:'Sinal GPS não informado; diagnóstico limitado.'};
 return{tone:'success',label:'Sinal GPS válido',detail:'Posição recente na última comunicação; sem indício imediato.'};
}

const gpsOutdated=(loc,now=Date.now())=>gpsStatus(loc,now).label==='GPS desatualizado';
function devicePin(loc,now=Date.now()){const label=communication(loc,now);return {label:gpsOutdated(loc,now)?'GPS desatualizado · '+label:label,tone:gpsOutdated(loc,now)?'purple':/^(Atualizado|Ligado)/.test(label)?'green':/^Desligado/.test(label)?'red':/^(Possível GPS|Desatualizado|Sem atualização)/.test(label)?'amber':'neutral'};}
