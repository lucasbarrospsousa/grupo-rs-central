import {copyCandidate,copySelectedIccids} from './warehouse-chip-copy.js';
import {savedView} from './saved-view.js';
import {reserveChip,activationCandidate,activationLabels} from './warehouse-activation-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const portal='https://arya.hinovaconecta.com.br/suporte/acoes-em-lote';
// Compatibility exports fail closed for cached imports.
export async function requestActivationLot(){throw Error('Ativação manual: a Central não envia solicitações.');}
export async function sendPreparedActivationLot(){throw Error('Ativação manual: a Central não envia solicitações.');}
export function mountWarehouseActivation(root,{repo,icon,onUpdate=()=>{},idPrefix=''} ){
 const find=selector=>root.querySelector(selector.replace('#reserve-','#'+idPrefix+'reserve-'));
 let copyRows=[],rows=[],selected=new Set(),busy=false,query='',page=0,message='';
 const remote=repo.real&&repo.readView?savedView(repo,repo.currentBranch,'warehouse',root,draw):null;
 const canWrite=()=>repo.real&&repo.user?.branches?.some(b=>b.id==='imperatriz'&&b.role==='admin')&&(repo.user?.permissions?.owner||repo.user?.permissions?.writes?.includes('warehouse'));
 async function call(body){
  if(busy||!canWrite()||body.action!=='check')return;busy=true;message='Conferindo situação na Árya…';draw();
  try{const result=await repo.request('warehouse-activation?branch=imperatriz',{method:'POST',body});message=result.message;}
  catch(e){message=e.message;}
  finally{selected.clear();rows=repo.warehouse;busy=false;draw();if(root.isConnected)onUpdate();}
 }
 async function copy(){
  if(busy||!selected.size)return;busy=true;
  try{const count=await copySelectedIccids(copyRows,[...selected]);message=count+' ICCIDs copiados, separados por ponto e vírgula.';selected.clear();}
  catch(e){message=e.message;}
  finally{busy=false;draw();}
 }
 function draw(){
  if(!root.isConnected)return;
  const result=remote?.get({view:'activation',query,page});if(remote&&!result)return;if(result)page=result.page;
  const reserve=rows.filter(reserveChip),available=reserve.filter(activationCandidate),list=result?.rows||reserve.filter(r=>[r.serial,r.chip_operator,r.chip_phone].some(v=>String(v||'').toLowerCase().includes(query)));
  page=Math.min(page,Math.max(0,Math.ceil((result?.total??list.length)/20)-1));copyRows=remote?list:list.slice(page*20,page*20+20);selected=new Set([...selected].filter(id=>copyRows.some(r=>r.id===id&&copyCandidate(r))));
  const batches=new Map();for(const r of rows.filter(r=>r.kind==='chip'&&r.activation_batch)){if(!batches.has(r.activation_batch))batches.set(r.activation_batch,[]);batches.get(r.activation_batch).push(r);}
  root.innerHTML=`<div class="warehouse-heading"><div><h2>${icon('chip')} Chips reserva</h2><p>Ative manualmente na Árya. Atualizar situação apenas confere os chips e libera os ativos no estoque.</p></div><a href="${portal}" target="_blank" rel="noopener noreferrer">${icon('right')} Abrir Árya</a></div>
  <div class="reserve-summary"><span class="pill blue">${result?.activation.available??available.length} sem confirmação</span><span class="pill amber">${result?.activation.waiting??rows.filter(r=>['requested','sending','uncertain'].includes(r.activation_state)).length} aguardando</span><span class="pill green">${result?.activation.active??rows.filter(r=>r.activation_state==='active').length} ativados</span><button id="${idPrefix}activation-check-all" ${!canWrite()||busy?'disabled':''}>${icon('refresh')} Atualizar situação</button></div>
  <div class="toolbar"><input id="${idPrefix}reserve-search" aria-label="Buscar chip reserva" placeholder="ICCID, operadora ou telefone" value="${esc(query)}"><button id="${idPrefix}reserve-select" ${!canWrite()||busy?'disabled':''}>Selecionar página</button></div>
  <div class="table-wrap"><table><thead><tr><th>Selecionar</th><th>ICCID / operadora</th><th>Telefone</th><th>Ativação</th></tr></thead><tbody>${(remote?list:list.slice(page*20,page*20+20)).map(r=>`<tr><td><input type="checkbox" data-reserve-id="${esc(r.id)}" aria-label="Selecionar chip ${esc(r.serial)}" ${selected.has(r.id)?'checked':''} ${!canWrite()||busy||!copyCandidate(r)?'disabled':''}></td><td><strong>${esc(r.serial)}</strong><small>${esc(r.chip_operator||'Operadora não informada')}</small></td><td>${esc(r.chip_phone||'Ainda não informado')}</td><td><span class="pill ${r.activation_state==='requested'?'amber':r.activation_state==='active'?'green':'blue'}">${esc(activationLabels[r.activation_state]||(r.chip_provider==='arya'?'Aguardando conferência':'Ativação fora da Árya'))}</span></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhum chip reserva. Cadastre uma entrada de chip sem telefone ou classifique-o como Reserva.</td></tr>'}</tbody></table></div>
  <div class="warehouse-pagination"><span>${result?.total??list.length} chips • ${selected.size} selecionados</span><div><button id="${idPrefix}reserve-prev" ${page===0?'disabled':''}>‹</button><button id="${idPrefix}reserve-next" ${(page+1)*20>=(result?.total??list.length)?'disabled':''}>›</button></div></div>
  <p class="muted">A cópia não envia solicitações. A situação é conferida somente ao clicar em Atualizar situação.</p>
  <button class="primary" id="${idPrefix}reserve-copy" ${!canWrite()||busy||!selected.size?'disabled':''}>${icon('right')} ${busy?'Processando…':'Copiar ICCIDs'}</button><p role="status">${esc(message||(!repo.real?'Demonstração: envio e gravação desabilitados.':''))}</p>
  <details><summary>${icon('file')} Lotes e histórico (${result?.batches.length??batches.size})</summary><div class="reserve-batches">${(result?result.batches.map(b=>[b.id,[],b]):[...batches]).reverse().map(([id,items,batch])=>{const prepared=batch?.prepared??(items.some(r=>r.activation_state==='prepared')&&!items.some(r=>['sending','uncertain'].includes(r.activation_state))),uncertain=batch?.uncertain??items.some(r=>['sending','uncertain'].includes(r.activation_state)),done=batch?.done??items.every(r=>r.activation_state==='active');return `<article><strong>Lote ${esc(id.slice(0,8))} • ${batch?.count??items.length} chips</strong><span class="pill ${done?'green':'purple'}">${done?'Ativos confirmados':uncertain?'Envio em conferência • sem reenvio':prepared?'Preparação antiga • envio desativado':'Solicitação registrada / em acompanhamento'}</span><small>${esc((batch?.at||items[0]?.activation_at)?new Date(batch?.at||items[0]?.activation_at).toLocaleString('pt-BR'):'')} ${esc(batch?.reference||items[0]?.activation_reference||'')}</small><details data-batch-detail="${esc(id)}"><summary>Ver ICCIDs do lote</summary><textarea readonly aria-label="ICCIDs do lote ${esc(id.slice(0,8))}">${items.map(r=>esc(r.serial)).join(';')}</textarea></details>${uncertain?'<p class="muted">A resposta pode ter se perdido. Conferir ativação consulta a Árya e atualiza o estoque, sem repetir o envio.</p>':''}<button data-check-batch="${id}" ${!canWrite()||busy||done?'disabled':''}>${icon('refresh')} Conferir ativação</button></article>`;}).join('')||'<p class="muted">Nenhum lote no histórico.</p>'}</div></details>`;
  root.querySelectorAll('[data-batch-detail]').forEach(el=>el.ontoggle=async()=>{if(!remote||!el.open||el.dataset.loaded)return;const out=el.querySelector('textarea');out.value='Consultando…';try{const data=await repo.readView(repo.currentBranch,'warehouse?'+new URLSearchParams({branch:repo.currentBranch,view:'batch',id:el.dataset.batchDetail}));if(el.isConnected){out.value=data.rows.map(r=>r.serial).join(';');el.dataset.loaded='1';}}catch(e){out.value=e.message;}});
  root.querySelector('#'+idPrefix+'activation-check-all').onclick=()=>call({action:'check'});
  find('#reserve-search').oninput=e=>{selected.clear();query=e.target.value.toLowerCase();page=0;const position=e.target.selectionStart;draw();const input=find('#reserve-search');input.focus();input.setSelectionRange(position,position);};
  find('#reserve-select').onclick=()=>{selected=new Set((remote?list:list.slice(page*20,page*20+20)).filter(copyCandidate).map(r=>r.id));draw();};
  root.querySelectorAll('[data-reserve-id]').forEach(c=>c.onchange=()=>{if(c.checked)selected.add(c.dataset.reserveId);else selected.delete(c.dataset.reserveId);draw();});
  find('#reserve-prev').onclick=()=>{selected.clear();page--;draw();};find('#reserve-next').onclick=()=>{selected.clear();page++;draw();};
  find('#reserve-copy').onclick=copy;
  root.querySelectorAll('[data-check-batch]').forEach(b=>b.onclick=()=>call({action:'check',batch:b.dataset.checkBatch}));
 }
 return {get busy(){return busy;},clearSelection(){selected.clear();},update(next){if(busy)return;rows=next;draw();}};
}
