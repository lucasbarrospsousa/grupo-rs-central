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
 let loading=false;
 const root=document.querySelector('#stock-body'),heading=document.querySelector('.stock-card-heading small');
 const observed=row=>row?.observation;
 async function refresh(force=false){
  if(!root.isConnected||loading)return;
  if(force){loading=true;try{await repo.load(branch);if(root.isConnected)draw();}catch(e){if(root.isConnected)heading.textContent=e.message;}finally{loading=false;}}
  if(root.isConnected){const rows=[...root.querySelectorAll('[data-detail]')].map(b=>repo.list(branch).find(r=>r.id===b.dataset.detail)),done=rows.filter(r=>observed(r)).length;heading.textContent=`Atualização automática no servidor • ${done}/${rows.length} aparelhos desta página consultados • clique na série para detalhes`;}
 }
 const timer=setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}void refresh(true);},60000);
 return{refresh,decorate:rows=>rows.map(r=>{const data=observed(r);if(!data)return r;return{...r,communication:communication(data.location),connectivity:data.chip?.ok?data.chip.connectivity||'Não informado':'Consulta pendente',phone:data.equipment?.phone||r.phone,iccid:data.equipment?.iccid||r.iccid};}),
 details(id){const row=repo.list(branch).find(r=>r.id===id),data=observed(row);const field=(label,v)=>`<div>${label}<b>${esc(v||'Não informado')}</b></div>`;
 showModal('Consulta do aparelho • '+esc(row.serial),data?`<h3>Plataforma</h3><div class="detail-list">${field('Resultado',data.location.ok?'Consulta confirmada':data.location.message)}${field('Cliente',data.location.client||data.equipment.client)}${field('Placa / identificação',data.equipment.plate)}${field('Última comunicação',data.location.updated_at)}${field('Data GPS',data.location.gps_at)}${field('Ignição',data.location.ignition)}${field('Bateria',data.location.battery)}</div><h3>Chip</h3><div class="detail-list">${field('ICCID',data.equipment.iccid)}${field('Telefone',data.chip.phone||data.equipment.phone)}${field('Consulta',data.chip.ok?data.chip.provider:data.chip.message)}${field('Conectividade',data.chip.connectivity)}${field('Situação cadastral',data.chip.status)}${field('Consultado em',data.queried_at)}</div>`:'<p>Consulta em andamento. Aguarde a atualização desta página.</p>','medium');}
 };
}
