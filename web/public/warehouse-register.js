export function wireWarehouseRegistration({repo,branch,modal,notify,render,safe,escape,validIccid,onSaved=()=>{}}){
 const form=document.querySelector('#warehouse-form'),input=form.querySelector('#new-serial'),save=form.querySelector('#save-item');
 let kind='device',busy=false;
 const provider=form.querySelector('#chip-provider'),result=form.querySelector('#chip-validation');
 const validate=()=>{
  form.querySelector('#serial-title').textContent=kind==='chip'?'ICCID do chip':'Número de série';
  form.querySelector('#chip-fields').hidden=kind!=='chip';
  input.disabled=provider.disabled=busy;
  save.disabled=busy||(kind==='chip'&&(!repo.real||!validIccid(input.value.trim())));
  save.textContent=busy?(kind==='chip'?'Buscando e salvando…':'Salvando…'):(repo.real?'Salvar':'Salvar na demonstração');
 };
 const reset=()=>{result.textContent='Ao salvar, buscaremos os dados do chip no provedor e concluiremos o cadastro automaticamente.';validate();};
 for(const value of ['device','chip'])document.querySelector('#kind-'+value).onclick=()=>{
  if(busy)return;kind=value;input.value='';input.placeholder=kind==='chip'?'ICCID completo com 19 ou 20 dígitos':'Série com 9 dígitos';
  document.querySelector('#kind-device').classList.toggle('primary',kind==='device');document.querySelector('#kind-chip').classList.toggle('primary',kind==='chip');reset();
 };
 input.oninput=provider.onchange=reset;
 form.onsubmit=event=>{event.preventDefault();if(busy||(repo.real&&repo.currentBranch!==branch)||(kind==='chip'&&(!repo.real||!validIccid(input.value.trim()))))return;
  busy=true;validate();safe(async()=>{try{await repo.addWarehouse(kind,input.value.trim(),provider.value,form.querySelector('#new-classification').value);modal.close();onSaved(kind);render();notify(kind==='chip'?'Chip e operadora salvos no armazém.':'Aparelho cadastrado.');}finally{busy=false;if(form.isConnected)validate();}});
 };
 reset();
}
