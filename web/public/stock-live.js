import {visibleStockQueue} from './visible-stock.js';
import {showStockLocation} from './stock-location.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function communication(sample,now=Date.now()){
 if(!sample?.ok)return sample?.message?'Consulta pendente':'Não consultado';
 const parse=v=>{const s=String(v||'').replace(' ','T');return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(s)?s+'-03:00':s);};
 const at=parse(sample.updated_at),gps=parse(sample.gps_at),ign=String(sample.ignition).toLowerCase(),off=['0','false','off','desligado'].includes(ign),on=['1','true','on','ligado'].includes(ign);
 if(!Number.isFinite(at))return 'Data não informada';
 if(now-at>(off?3600000:600000))return 'Desatualizado';
 if(!Number.isFinite(gps)||at-gps>7200000)return 'Possível GPS';
 return off?'Desligado':on?'Atualizado':'Ignição não informada';
}
export function createStockLive({repo,branch,draw,showModal}){
 const root=document.querySelector('#stock-body'),heading=document.querySelector('.stock-card-heading small');
 const samples=new Map();
 const observed=row=>samples.get(row?.id)||row?.observation;
 const visible=()=>[...root.querySelectorAll('[data-detail]')].map(b=>b.dataset.detail);
 const progress=()=>{if(root.isConnected)heading.textContent=`Consulta da página • ${queue.pending()} pendente(s) • aparelhos, plataforma e chips`;};
 const fetchRow=async id=>{const row=repo.list(branch).find(r=>r.id===id);if(!row)throw Error('Cadastro não encontrado.');return repo.request('integrations/stock?'+new URLSearchParams({branch,serial:row.serial}));};
 const queue=visibleStockQueue({query:fetchRow,onProgress:progress,onResult:(id,data)=>{samples.set(id,data.error?{location:{ok:false,message:data.error},equipment:{},chip:{ok:false,message:data.error}}:data);if(root.isConnected)draw();}});
 function refresh(force=false){if(root.isConnected){queue.set(visible(),force);progress();}}
 const timer=setInterval(()=>{if(root.isConnected&&!document.hidden)refresh();},60000);
 const observer=new MutationObserver(()=>{if(!root.isConnected){queue.close();clearInterval(timer);observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
 return{refresh,decorate:rows=>rows.map(r=>{const data=observed(r);if(!data)return r;return{...r,communication:communication(data.location),connectivity:data.chip?.ok?data.chip.connectivity||'Não informado':'Consulta pendente',phone:data.equipment?.phone||r.phone,iccid:data.equipment?.iccid||r.iccid};}),
 details(id,location=false){const row=repo.list(branch).find(r=>r.id===id),data=observed(row);if(location)return showStockLocation({row,data,showModal,query:()=>fetchRow(id),onData:value=>{samples.set(id,value);if(root.isConnected)draw();}});const field=(label,v)=>`<div>${label}<b>${esc(v||'Não informado')}</b></div>`;
 showModal('Consulta do aparelho • '+esc(row.serial),data?`<h3>Plataforma</h3><div class="detail-list">${field('Resultado',data.location.ok?'Consulta confirmada':data.location.message)}${field('Cliente',data.location.client||data.equipment.client)}${field('Placa / identificação',data.equipment.plate)}${field('Última comunicação',data.location.updated_at)}${field('Data GPS',data.location.gps_at)}${field('Ignição',data.location.ignition)}${field('Bateria',data.location.battery)}</div><h3>Chip</h3><div class="detail-list">${field('ICCID',data.equipment.iccid)}${field('Telefone',data.chip.phone||data.equipment.phone)}${field('Consulta',data.chip.ok?data.chip.provider:data.chip.message)}${field('Conectividade',data.chip.connectivity)}${field('Situação cadastral',data.chip.status)}${field('Consultado em',data.queried_at)}</div>`:'<p>Consulta em andamento. Aguarde a atualização desta página.</p>','medium');}
 };
}
