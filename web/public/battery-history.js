import {ignitionLabel} from './communication-state.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const batteryValue=(v,unit)=>v===null||v===undefined?'Não informado':esc(v)+' '+unit;
const date=v=>v?esc(new Date(v).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})):'Não informado';
export function mountBatteries({repo,branch}){
 const root=document.querySelector('#page');let page=1,seq=0;
 root.innerHTML=`<section class="panel"><h2>Histórico de baterias · Multioperadora</h2><p>Últimos 30 dias · Leituras recebidas nas consultas existentes. Sem consultas adicionais às plataformas.</p><form id="battery-search" class="actions"><label class="field">Número do aparelho<input name="q" maxlength="80" placeholder="Buscar série"></label><button class="primary">Pesquisar</button></form><p>O histórico começa após a ativação desta função. Intervalos sem leituras não comprovam descarga ou dormência.</p></section><section class="panel"><p id="battery-state" role="status"></p><div style="overflow:auto"><table><thead><tr><th>Aparelho / modelo</th><th>Comunicação</th><th>Externa</th><th>Interna</th><th>Tensão interna</th><th>Ignição</th><th>Coletado em</th></tr></thead><tbody id="battery-rows"></tbody></table></div><div class="actions"><button id="battery-prev">Anterior</button><span id="battery-page"></span><button id="battery-next">Próximo</button></div><p>Valores informados pelo rastreador; tensão estimada é identificada quando a origem informa essa condição. Este histórico não mede a capacidade real nem a vida útil da bateria.</p></section>`;
 const el=id=>root.querySelector('#battery-'+id);
 async function load(){const run=++seq;el('state').textContent='Carregando histórico salvo…';el('prev').disabled=el('next').disabled=true;el('rows').innerHTML='';try{
 const data=repo.real?await repo.request('battery-history?'+new URLSearchParams({branch,q:root.querySelector('[name=q]').value.trim(),page})): {rows:[],total:0};
 if(run!==seq||!root.isConnected)return;
 el('state').textContent=data.rows.length?data.total+' leituras salvas':'Nenhuma leitura salva para este filtro nos últimos 30 dias.';
 el('rows').innerHTML=data.rows.map(r=>{const s=r.sample;return `<tr><td><strong>${esc(r.serial)}</strong><br>${esc(r.model)}</td><td>${date(s.at)}</td><td>${batteryValue(s.external,'V')}</td><td>${batteryValue(s.internal,'%')}</td><td>${batteryValue(s.voltage,'V')}<br><small>${esc(s.voltage_origin)}</small></td><td>${esc(ignitionLabel(s.ignition))}</td><td>${date(r.created_at)}</td></tr>`;}).join('');el('page').textContent='Página '+page;el('prev').disabled=page===1;el('next').disabled=page*50>=data.total;
 }catch(e){if(run===seq&&root.isConnected){el('state').textContent='Falha ao carregar: '+e.message;el('prev').disabled=page===1;}}}
 root.querySelector('form').onsubmit=e=>{e.preventDefault();page=1;load();};el('prev').onclick=()=>{page--;load();};el('next').onclick=()=>{page++;load();};load();
}
