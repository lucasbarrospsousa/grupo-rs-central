export function providerFromApn(apn){
 const name=String(apn||'').trim().toLowerCase();
 return ['hinova.br','hinova'].includes(name)?'arya':['linksolutions.br','linksolutions'].includes(name)?'link':null;
}
export async function savedChipStatus(service,{iccid,apn}){
 if(!/^89\d{17,18}$/.test(iccid||''))return{ok:false,message:'ICCID salvo inválido. Use Atualizar aparelhos.'};
 const provider=providerFromApn(apn);
 if(!provider)return{ok:false,message:'APN ausente ou não reconhecida no cadastro. Aguarde a sonda ou use Atualizar aparelhos.'};
 try{const result=await service.carrier(provider,iccid);if(!result?.ok||result.iccid!==iccid)return{ok:false,provider,message:result?.message||'Chip não confirmado pela operadora da APN salva.'};return{...result,provider};}
 catch(e){return{ok:false,provider,message:e.message};}
}
