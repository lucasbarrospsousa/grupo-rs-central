export function wireWarehouseRegistration({repo,branch,modal,notify,render,safe,escape,validIccid}){
 const form=document.querySelector('#warehouse-form'),input=form.querySelector('#new-serial'),save=form.querySelector('#save-item');
 let kind='device',verified=null,generation=0,busy=false;
 const provider=form.querySelector('#chip-provider'),lookup=form.querySelector('#lookup-chip'),result=form.querySelector('#chip-validation');
 const validate=()=>{
  form.querySelector('#serial-title').textContent=kind==='chip'?'ICCID do chip':'Número de série';
  form.querySelector('#chip-fields').hidden=kind!=='chip';
  input.disabled=provider.disabled=busy;
  lookup.disabled=busy||!repo.real||!validIccid(input.value.trim());
  save.disabled=busy||(kind==='chip'&&(!repo.real||!verified));
 };
 const reset=()=>{generation++;verified=null;result.textContent='Busque o chip para conferir a operadora antes de salvar.';validate();};
 for(const value of ['device','chip'])document.querySelector('#kind-'+value).onclick=()=>{
  if(busy)return;kind=value;input.value='';input.placeholder=kind==='chip'?'ICCID completo com 19 ou 20 dígitos':'Série com 9 dígitos';
  document.querySelector('#kind-device').classList.toggle('primary',kind==='device');document.querySelector('#kind-chip').classList.toggle('primary',kind==='chip');reset();
 };
 input.oninput=provider.onchange=reset;
 lookup.onclick=async()=>{
  const serial=input.value.trim(),selected=provider.value,revision=++generation;
  verified=null;busy=true;validate();result.textContent='Consultando chip…';
  try{
   const data=await repo.request('integrations/carrier?'+new URLSearchParams({branch,provider:selected,iccid:serial}));
   if(!form.isConnected||revision!==generation||repo.currentBranch!==branch)return;
   if(data.ok!==true||data.iccid!==serial||data.provider!==selected||!String(data.operator||'').trim())throw Error(data.message||'Chip e operadora não confirmados.');
   verified={serial,provider:selected};
   result.innerHTML=`<div class="gate"><strong>Operadora: ${escape(data.operator)}</strong><p>Telefone: ${escape(data.phone||'Não informado')} · ${selected==='link'?'Link Solutions':'Hinova'}</p><small>Chip confirmado. Os dados serão conferidos novamente pelo servidor ao salvar.</small></div>`;
  }catch(error){if(form.isConnected&&revision===generation)result.textContent=error.message||'Consulta indisponível. Tente novamente.';}
  finally{busy=false;if(form.isConnected)validate();}
 };
 form.onsubmit=event=>{event.preventDefault();if(busy||(repo.real&&repo.currentBranch!==branch)||(kind==='chip'&&(!verified||verified.serial!==input.value.trim()||verified.provider!==provider.value)))return;
  busy=true;validate();safe(async()=>{try{await repo.addWarehouse(kind,input.value.trim(),provider.value);modal.close();render();notify(kind==='chip'?'Chip e operadora salvos no armazém.':'Aparelho cadastrado.');}finally{busy=false;if(form.isConnected)validate();}});
 };
 reset();
}
