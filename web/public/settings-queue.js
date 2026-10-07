import {startEconomyPolling} from './usage-control.mjs';
const names={imperatriz:'Imperatriz',araguaina:'Araguaína',acailandia:'Açailândia',maraba:'Marabá'};
export function mountQueryQueue(ctx,root){
 root.innerHTML=`<div class="queue-layout"><section class="settings-panel"><h2>Prioridade das consultas</h2><p>Controle compartilhado da sonda, estoque e manutenção por base.</p><form data-queue-form>
 <label><input type="checkbox" name="priority"> Priorizar ações manuais</label>
 <label>Automáticas simultâneas por base <select name="automatic_limit"><option value="1">1 · recomendado</option><option value="2">2 · compartilha todo o limite</option></select></label>
 <label>Retomar após ação manual <input name="resume_seconds" type="number" min="0" max="60" required> segundos</label>
 <label>Intervalo mínimo entre consultas automáticas <input name="gap_seconds" type="number" min="0" max="60" required> segundos</label>
 <fieldset><legend>Rotinas habilitadas</legend><label><input type="checkbox" name="codes"> Sonda de códigos · todas as bases</label><label><input type="checkbox" name="stock"> Monitoramento do estoque</label><label><input type="checkbox" name="maintenance"> Monitoramento de manutenções</label></fieldset>
 <button class="primary" type="submit" disabled>Salvar controles</button></form><p data-queue-message role="status"></p></section>
 <section class="settings-panel"><div class="codes-heading"><h2>Fila por base</h2><button data-queue-refresh>Atualizar</button></div><div data-queue-status role="status">Consultando…</div><p>Uma requisição já iniciada termina normalmente. Itens adiados continuam pendentes, sem registrar falha do aparelho.</p><small>Os intervalos dos lotes continuam valendo. Este painel consulta apenas o estado salvo; não inicia buscas.</small></section></div>`;
 const form=root.querySelector('form'),message=root.querySelector('[data-queue-message]');let busy=false,edited=false,snapshot;
 form.oninput=()=>{edited=true;};
 function paint(){if(!root.isConnected)return;
  if(!edited)for(const key of ['priority','automatic_limit','resume_seconds','gap_seconds','stock','codes','maintenance']){const input=form.elements[key];if(input.type==='checkbox')input.checked=!!snapshot[key];else input.value=snapshot[key];}
  root.querySelector('[data-queue-status]').innerHTML='<table><thead><tr><th>Base</th><th>Manuais</th><th>Automáticas</th><th>Estado automático</th></tr></thead><tbody>'+Object.entries(names).map(([id,name])=>{
   const b=snapshot.branches?.find(b=>b.branch===id)||{},enabled=snapshot.stock||snapshot.maintenance||(id==='imperatriz'&&snapshot.codes);
   const state=!enabled?'Pausado':Number(b.automatic)>0?'Consultando':snapshot.priority&&(Number(b.manual)>0||Number(b.waiting)>0||b.manual_hold)?'Aguardando ação manual':'Aguardando intervalo / próximo lote';
   return '<tr><td>'+name+'</td><td>'+Number(b.manual||0)+' em curso · '+Number(b.waiting||0)+' na fila</td><td>'+Number(b.automatic||0)+' / '+Number(snapshot.automatic_limit)+'</td><td>'+state+'</td></tr>';
  }).join('')+'</tbody></table><small>Leitura do servidor: '+new Date(snapshot.server_at).toLocaleTimeString('pt-BR')+'</small>';
  form.querySelector('button').disabled=false;
 }
 async function refresh(){if(busy||!root.isConnected)return;busy=true;try{snapshot=await ctx.repo.request('query-policy');paint();}catch(e){message.textContent='Não foi possível ler a fila: '+e.message;}finally{busy=false;}}
 form.onsubmit=async e=>{e.preventDefault();if(busy||!snapshot)return;busy=true;form.querySelector('button').disabled=true;const body={};for(const key of ['priority','stock','codes','maintenance'])body[key]=form.elements[key].checked;for(const key of ['automatic_limit','resume_seconds','gap_seconds'])body[key]=Number(form.elements[key].value);try{snapshot=await ctx.repo.request('query-policy',{method:'POST',body});edited=false;paint();message.textContent='Controles salvos no servidor.';}catch(e){message.textContent='Não foi possível salvar: '+e.message;}finally{busy=false;form.querySelector('button').disabled=false;}};
 root.querySelector('[data-queue-refresh]').onclick=()=>void refresh();
 startEconomyPolling(refresh,{interval:30000,alive:()=>root.isConnected,active:()=>!root.hidden});void refresh();return{refresh};
}
