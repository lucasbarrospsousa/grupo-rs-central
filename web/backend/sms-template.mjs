// Same APN profiles as src/modules/sms_module.gd; no inferred fallback.
export function standardSms(serial,apn){
 if(!/^024\d{6}$/.test(serial))throw Object.assign(Error('Série 024 inválida.'),{status:422});
 const normalized=String(apn||'').trim().toLowerCase();
 const profile=normalized.includes('link')?['linksolutions.br','link','link']:normalized.includes('hinova')?['hinova.br','hinova','hinova']:null;
 if(!profile)throw Object.assign(Error('A APN consultada não possui configuração padrão confirmada.'),{status:422});
 return {apn:normalized,command:`ST300NTW;${serial};319H;0;${profile.join(';')};grupors1.ddns.net;5940;grupors1.ddns.net;5941;#`};
}
export async function prepareStandardSms(service,branch,serial){
 if(branch!=='imperatriz')throw Object.assign(Error('Configuração SMS disponível em Imperatriz.'),{status:422});
 const equipment=await service.equipment(branch,serial);
 if(equipment.serial!==serial)throw Object.assign(Error('Série não confirmada na consulta da APN.'),{status:409});
 return {...standardSms(serial,equipment.apn),serial};
}
