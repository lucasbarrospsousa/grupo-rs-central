import {savedView} from './saved-view.js';
import {reserveChip,activationCandidate,activationLabels,activationSelection} from './warehouse-activation-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const portal='https://arya.hinovaconecta.com.br/suporte/acoes-em-lote';
const sending=new WeakSet();
export const sameActivationIccids=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&new Set(a).size===a.length&&new Set(b).size===b.length&&a.every(x=>typeof x==='string'&&b.includes(x));
const review=iccids=>typeof globalThis.confirm==='function'&&globalThis.confirm(`Solicitar ativação de exatamente ${iccids.length} chips?\n\n${iccids.join('\n')}\n\nConfira os ICCIDs. Nenhum outro chip será incluído.`);
// Snapshot the intent before awaiting anything. Never silently shrink or extend it.
export async function requestActivationLot(repo,ids,size,{confirm=review}={}){
 if(sending.has(repo))throw Error('Há uma solicitação em andamento. Aguarde a conclusão.');
 sending.add(repo);
 try{
  const selected=activationSelection(repo.warehouse,[...ids],size).map(r=>({id:r.id,serial:r.serial})),iccids=selected.map(r=>r.serial);
  if(!iccids.length||!sameActivationIccids(iccids,iccids))throw Error('Seleção inválida. Confira os chips.');
  if(!await confirm([...iccids]))return {ok:true,cancelled:true,message:'Solicitação cancelada. Nenhum lote enviado.'};
  const current=activationSelection(repo.warehouse,selected.map(r=>r.id),size);
  if(!current.every((r,i)=>r.serial===selected[i].serial))throw Error('Os chips mudaram durante a revisão. Selecione novamente.');
  const prepared=await repo.request('warehouse-activation?branch=imperatriz',{method:'POST',body:{action:'prepare',ids:selected.map(r=>r.id),iccids:[...iccids],size,confirmed:true}});
  if(prepared.ok!==true||prepared.state!=='prepared'||!prepared.id||prepared.count!==iccids.length||!sameActivationIccids(prepared.iccids,iccids))throw Error('Lote preparado diferente da seleção confirmada. Envio bloqueado; confira o lote.');
  return await repo.request('warehouse-activation-send?branch=imperatriz',{method:'POST',body:{action:'send',batch:prepared.id,iccids:[...iccids],confirmed:true}});
 }finally{sending.delete(repo);}
}
export async function sendPreparedActivationLot(repo,batch,{confirm=review}={}){
 if(sending.has(repo))throw Error('Há uma solicitação em andamento.');
 sending.add(repo);
 try{
  const result=await repo.readView(repo.currentBranch,'warehouse?'+new URLSearchParams({branch:repo.currentBranch,view:'batch',id:batch}));
  const iccids=result.rows.filter(r=>r.activation_state==='prepared').map(r=>r.serial);
  if(!iccids.length||iccids.length>20||!sameActivationIccids(iccids,iccids))throw Error('Lote indisponível. Atualize a lista.');
  if(!await confirm([...iccids]))return {ok:true,cancelled:true,message:'Envio cancelado.'};
  return await repo.request('warehouse-activation-send?branch=imperatriz',{method:'POST',body:{action:'send',batch,iccids,confirmed:true}});
 }finally{sending.delete(repo);}
}
export function mountWarehouseActivation(root,{repo,icon,onUpdate=()=>{},idPrefix=''} ){
 const find=selector=>root.querySelector(selector.replace('#reserve-','#'+idPrefix+'reserve-'));
 let rows=[],selected=new Set(),size=10,busy=false,query='',page=0,message='';
 const remote=repo.real&&repo.readView?savedView(repo,repo.currentBranch,'warehouse',root,draw):null;
 const canWrite=()=>repo.real&&repo.user?.branches?.some(b=>b.id==='imperatriz'&&b.role==='admin')&&(repo.user?.permissions?.owner||repo.user?.permissions?.writes?.includes('warehouse'));
 async function call(body){
  if(busy||!canWrite())return;busy=true;message=body.action==='check'?'Conferindo ativação…':'Conferindo chips e solicitando ativação…';draw();
  try{const result=body.action==='request'?await requestActivationLot(repo,body.ids,body.size):body.action==='send'?await sendPreparedActivationLot(repo,body.batch):await repo.request((body.action==='send'?'warehouse-activation-send':'warehouse-activation')+'?branch=imperatriz',{method:'POST',body});selected.clear();message=result.message|| (body.action==='check'?`${result.confirmed} ativos confirmados • ${result.pending} sem confirmação de ativação • ${result.errors} falhas de consulta`:'Solicitação registrada. Aguarde a ativação pela operadora.');
  }catch(e){message=e.message+' Atualize a lista antes de tentar novamente.';}
  finally{selected.clear();rows=repo.warehouse;busy=false;draw();if(root.isConnected)onUpdate();}
 }
 function draw(){
  if(!root.isConnected)return;
  const result=remote?.get({view:'activation',query,page});if(remote&&!result)return;if(result)page=result.page;
  const reserve=rows.filter(reserveChip),available=reserve.filter(activationCandidate),list=result?.rows||reserve.filter(r=>[r.serial,r.chip_operator,r.chip_phone].some(v=>String(v||'').toLowerCase().includes(query)));
  page=Math.min(page,Math.max(0,Math.ceil((result?.total??list.length)/20)-1));selected=new Set([...selected].filter(id=>(repo.real?repo.warehouse.filter(activationCandidate):available).some(r=>r.id===id)));
  const batches=new Map();for(const r of rows.filter(r=>r.kind==='chip'&&r.activation_batch)){if(!batches.has(r.activation_batch))batches.set(r.activation_batch,[]);batches.get(r.activation_batch).push(r);}
  root.innerHTML=`<div class="warehouse-heading"><div><h2>${icon('chip')} Chips reserva</h2><p>Finalizados na Árya passam para o estoque ao atualizar.</p></div><a href="${portal}" target="_blank" rel="noopener noreferrer">${icon('right')} Abrir Árya</a></div>
  <div class="reserve-summary"><span class="pill blue">${result?.activation.available??available.length} para solicitar</span><span class="pill amber">${result?.activation.waiting??rows.filter(r=>['requested','sending','uncertain'].includes(r.activation_state)).length} aguardando</span><span class="pill green">${result?.activation.active??rows.filter(r=>r.activation_state==='active').length} ativados</span><button id="${idPrefix}activation-check-all" ${!canWrite()||busy?'disabled':''}>${icon('refresh')} Atualizar situação</button></div>
  <div class="toolbar"><input id="${idPrefix}reserve-search" aria-label="Buscar chip reserva" placeholder="ICCID, operadora ou telefone" value="${esc(query)}"><select id="${idPrefix}reserve-size" aria-label="Tamanho do lote"><option value="10" ${size===10?'selected':''}>Até 10 chips</option><option value="20" ${size===20?'selected':''}>Até 20 chips</option></select><button id="${idPrefix}reserve-select" ${!canWrite()||busy?'disabled':''}>Selecionar até ${size}</button></div>
  <div class="table-wrap"><table><thead><tr><th>Selecionar</th><th>ICCID / operadora</th><th>Telefone</th><th>Ativação</th></tr></thead><tbody>${(remote?list:list.slice(page*20,page*20+20)).map(r=>`<tr><td><input type="checkbox" data-reserve-id="${esc(r.id)}" aria-label="Selecionar chip ${esc(r.serial)}" ${selected.has(r.id)?'checked':''} ${!canWrite()||busy||!activationCandidate(r)?'disabled':''}></td><td><strong>${esc(r.serial)}</strong><small>${esc(r.chip_operator||'Operadora não informada')}</small></td><td>${esc(r.chip_phone||'Ainda não informado')}</td><td><span class="pill ${r.activation_state==='requested'?'amber':r.activation_state==='active'?'green':'blue'}">${esc(activationLabels[r.activation_state]||(r.chip_provider==='arya'?'Aguardando conferência':'Ativação fora da Árya'))}</span></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Nenhum chip reserva. Cadastre uma entrada de chip sem telefone ou classifique-o como Reserva.</td></tr>'}</tbody></table></div>
  <div class="warehouse-pagination"><span>${result?.total??list.length} chips • ${selected.size}/${size} selecionados</span><div><button id="${idPrefix}reserve-prev" ${page===0?'disabled':''}>‹</button><button id="${idPrefix}reserve-next" ${(page+1)*20>=(result?.total??list.length)?'disabled':''}>›</button></div></div>
  <p class="muted">Antes de enviar, a Central confere os chamados e ignora chips já pendentes. Envio não significa ativação concluída.</p>
  <button class="primary" id="${idPrefix}reserve-request" ${!canWrite()||busy||!selected.size?'disabled':''}>${icon('right')} ${busy?'Processando…':'Solicitar ativação do lote'}</button><p role="status">${esc(message||(!repo.real?'Demonstração: envio e gravação desabilitados.':''))}</p>
  <details><summary>${icon('file')} Lotes e histórico (${result?.batches.length??batches.size})</summary><div class="reserve-batches">${(result?result.batches.map(b=>[b.id,[],b]):[...batches]).reverse().map(([id,items,batch])=>{const prepared=batch?.prepared??(items.some(r=>r.activation_state==='prepared')&&!items.some(r=>['sending','uncertain'].includes(r.activation_state))),uncertain=batch?.uncertain??items.some(r=>['sending','uncertain'].includes(r.activation_state)),done=batch?.done??items.every(r=>r.activation_state==='active');return `<article><strong>Lote ${esc(id.slice(0,8))} • ${batch?.count??items.length} chips</strong><span class="pill ${done?'green':'purple'}">${done?'Ativos confirmados':uncertain?'Envio em conferência • sem reenvio':prepared?'Preparado • pronto para enviar':'Solicitação registrada / em acompanhamento'}</span><small>${esc((batch?.at||items[0]?.activation_at)?new Date(batch?.at||items[0]?.activation_at).toLocaleString('pt-BR'):'')} ${esc(batch?.reference||items[0]?.activation_reference||'')}</small><details data-batch-detail="${esc(id)}"><summary>Ver ICCIDs do lote</summary><textarea readonly aria-label="ICCIDs do lote ${esc(id.slice(0,8))}">${items.map(r=>esc(r.serial)).join(';')}</textarea></details>${prepared?`<button class="primary" data-send-batch="${id}" ${!canWrite()||busy?'disabled':''}>${icon('right')} Solicitar ativação do lote</button>`:''}${uncertain?'<p class="muted">A resposta pode ter se perdido. Conferir ativação consulta a Árya e atualiza o estoque, sem repetir o envio.</p>':''}<button data-check-batch="${id}" ${!canWrite()||busy||done?'disabled':''}>${icon('refresh')} Conferir ativação</button></article>`;}).join('')||'<p class="muted">Nenhum lote preparado.</p>'}</div></details>`;
  root.querySelectorAll('[data-batch-detail]').forEach(el=>el.ontoggle=async()=>{if(!remote||!el.open||el.dataset.loaded)return;const out=el.querySelector('textarea');out.value='Consultando…';try{const data=await repo.readView(repo.currentBranch,'warehouse?'+new URLSearchParams({branch:repo.currentBranch,view:'batch',id:el.dataset.batchDetail}));if(el.isConnected){out.value=data.rows.map(r=>r.serial).join(';');el.dataset.loaded='1';}}catch(e){out.value=e.message;}});
  root.querySelector('#'+idPrefix+'activation-check-all').onclick=()=>call({action:'check'});
  find('#reserve-search').oninput=e=>{selected.clear();query=e.target.value.toLowerCase();page=0;const position=e.target.selectionStart;draw();const input=find('#reserve-search');input.focus();input.setSelectionRange(position,position);};
  find('#reserve-size').onchange=e=>{size=Number(e.target.value);selected.clear();draw();};
  find('#reserve-select').onclick=()=>{selected=new Set(list.filter(activationCandidate).slice(0,size).map(r=>r.id));draw();};
  root.querySelectorAll('[data-reserve-id]').forEach(c=>c.onchange=()=>{if(c.checked&&selected.size<size)selected.add(c.dataset.reserveId);else selected.delete(c.dataset.reserveId);draw();});
  find('#reserve-prev').onclick=()=>{selected.clear();page--;draw();};find('#reserve-next').onclick=()=>{selected.clear();page++;draw();};
  find('#reserve-request').onclick=()=>call({action:'request',ids:[...selected],size});
  root.querySelectorAll('[data-send-batch]').forEach(b=>b.onclick=()=>call({action:'send',batch:b.dataset.sendBatch,confirmed:true}));
  root.querySelectorAll('[data-check-batch]').forEach(b=>b.onclick=()=>call({action:'check',batch:b.dataset.checkBatch}));
 }
 return {get busy(){return busy;},clearSelection(){selected.clear();},update(next){if(busy)return;rows=next;draw();}};
}
