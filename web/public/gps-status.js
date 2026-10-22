import {communicationStatus} from './communication-state.js';
import {validPoint} from './tracking-model.js';
const time=v=>{let s=String(v||'').trim().replace(' ','T');if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)&&!/(Z|[+-]\d{2}:?\d{2})$/i.test(s))s+='-03:00';return Date.parse(s);};
export function gpsStatus(loc,now=Date.now()){
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

export const gpsOutdated=(loc,now=Date.now())=>gpsStatus(loc,now).label==='GPS desatualizado';
