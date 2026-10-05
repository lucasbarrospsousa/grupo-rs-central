const fail=(status,message)=>Object.assign(Error(message),{status});
export async function verifyWarehouseChip(service,serial,provider='arya'){
 if(!/^89\d{17,18}$/.test(serial||'')||!['arya','link'].includes(provider))throw fail(400,'Informe ICCID e provedor válidos.');
 const checked=await service.carrier(provider,serial);
 if(checked?.ok!==true||checked.iccid!==serial||checked.provider!==provider)throw fail(422,'Chip exato não confirmado no provedor selecionado.');
 const operator=String(checked.operator||'').trim(),phone=String(checked.phone||'').trim();
 if(!operator||operator.length>120||/[<>\x00-\x1f]/.test(operator)||phone.length>40)throw fail(422,'O provedor não retornou uma operadora válida. Cadastro não salvo.');
 return {provider,operator,phone};
}
