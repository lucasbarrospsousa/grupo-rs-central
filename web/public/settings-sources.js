const names={imperatriz:'Imperatriz',araguaina:'Araguaína',acailandia:'Açailândia',maraba:'Marabá'};
export function mountSources(ctx,root){
 root.innerHTML='<h2>Fontes de consulta das bases</h2><p>Escolha como consultar cada base. Em “Usar ambos”, a web complementa os dados ausentes da API. Divergências de vínculo exigem conferência.</p><p>Esta opção controla leituras Grupo RS. Chips continuam nas operadoras; criação, vinculação e comandos mantêm o fluxo próprio de confirmação.</p><div data-sources-body role="status">Carregando…</div>';
 const body=root.querySelector('[data-sources-body]');
 void ctx.repo.request('read-sources').then(data=>{
  if(!root.isConnected)return;
  body.innerHTML='<form class="sources-form">'+Object.entries(names).map(([id,name])=>'<label>'+name+'<select name="'+id+'">'+[['api','Usar somente API'],['web','Usar somente a web'],['both','Usar ambos']].map(([value,label])=>'<option value="'+value+'">'+label+'</option>').join('')+'</select></label>').join('')+'<button type="submit">Salvar fontes</button></form><p data-source-message role="status"></p>';
  const form=body.querySelector('form'),message=body.querySelector('[data-source-message]');
  for(const r of data.branches)if(names[r.branch_id])form.elements[r.branch_id].value=r.mode;
  form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;message.textContent='Salvando…';try{await ctx.repo.request('read-sources',{method:'POST',body:{branches:Object.keys(names).map(branch_id=>({branch_id,mode:form.elements[branch_id].value}))}});message.textContent='Fontes salvas. Novas consultas e os próximos lotes usam esta configuração.';}catch(e){message.textContent='Não foi possível salvar: '+e.message;}finally{button.disabled=false;}};
 }).catch(e=>{if(root.isConnected)body.textContent='Configuração restrita à administração ou indisponível: '+e.message;});
}
