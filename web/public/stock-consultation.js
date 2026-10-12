import {recordIcon} from './maintenance-icons.js';
import {ignitionLabel} from './communication-state.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const present=v=>v!==null&&v!==undefined&&v!=='';
export function consultationDate(v){
 if(!v)return '';
 // Platform timestamps without an offset already use branch local time.
 const local=String(v).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
 if(local)return `${local[3]}/${local[2]}/${local[1]} ${local[4]}`;
 const date=new Date(v);return Number.isNaN(date.getTime())?'':date.toLocaleString('pt-BR',{timeZone:'America/Fortaleza'});
}
export function consultationHtml(data){
 if(!data)return '<p>Consulta em andamento. Aguarde a atualização da lista.</p>';
 const l=data.location||{},e=data.equipment||{},c=data.chip||{};
 const field=(name,value)=>present(value)?`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`:'';
 const notice=(ok,message)=>`<p class="consult-status ${ok?'ok':'pending'}">${recordIcon(ok?'document':'alert')}${esc(message)}</p>`;
 return `<style>
 #modal:has(.stock-consultation){width:min(820px,calc(100vw - 24px))}
 .stock-consultation{font-size:14px}.stock-consultation .consult-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
 .stock-consultation section{border:1px solid #d9e7f6;border-radius:14px;background:linear-gradient(135deg,#f0f7ff,#fff);padding:16px;min-width:0}
 .stock-consultation h3{display:flex;align-items:center;gap:9px;margin:0 0 10px;font-size:18px;color:#173e65}
 .stock-consultation .record-icon{width:21px;height:21px;flex:none;color:#0985e8}
 .stock-consultation dl{margin:0}.stock-consultation dl>div{padding:8px 0;border-bottom:1px solid #e3edf7}.stock-consultation dl>div:last-child{border:0}
 .stock-consultation dt{font-size:12px;color:#627e9e}.stock-consultation dd{margin:3px 0 0;font-weight:600;color:#173e65;overflow-wrap:anywhere}
 .stock-consultation .consult-status{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:8px;margin:0 0 6px;font-size:13px}
 .stock-consultation .ok{background:#e4f5ee;color:#08774e}.stock-consultation .pending{background:#fff3dc;color:#895600}
 .stock-consultation footer{margin-top:12px;font-size:12px;color:#627e9e}
 @media(max-width:600px){.stock-consultation .consult-grid{grid-template-columns:1fr}}
 </style><div class="stock-consultation"><div class="consult-grid"><section><h3>${recordIcon('device')}Aparelho</h3>
 ${notice(l.ok,l.ok?'Dados da plataforma':l.message||'Consulta pendente')}
 <dl>${field('Associado',l.client||e.client)}${field('Placa / identificação',e.plate||l.plate)}${field('Última comunicação',consultationDate(l.updated_at))}${field('Último evento GPS',consultationDate(l.gps_at))}${field('Ignição',ignitionLabel(l.ignition))}${field('Bateria externa',present(l.battery)?l.battery+' V':'')}${field('Bateria interna',[present(l.internal_battery_voltage)?l.internal_battery_voltage+' V':'',present(l.internal_battery)?l.internal_battery+'%':''].filter(Boolean).join(' · '))}</dl></section>
 <section><h3>${recordIcon('message')}Chip</h3>${notice(c.ok,c.ok?(c.connectivity||'Consulta confirmada'):c.message||'Consulta pendente')}<dl>${field('ICCID',e.iccid)}${field('Telefone',c.phone||e.phone)}${field('Operadora',e.carrier)}${field('Fonte',c.ok?c.provider:'')}</dl></section></div>${data.queried_at?`<footer>Última consulta: ${esc(consultationDate(data.queried_at))}</footer>`:''}</div>`;
}
