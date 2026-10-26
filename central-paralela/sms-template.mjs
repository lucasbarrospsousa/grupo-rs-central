export function standardSms(serial,apn){
 if(!/^024\d{6}$/.test(serial))throw Object.assign(Error('Série 024 inválida.'),{status:422});
 const normalized=String(apn||'').trim().toLowerCase();
 const profile=['link','linksolutions.br'].includes(normalized)?['linksolutions.br','link','link']:['hinova','hinova.br'].includes(normalized)?['hinova.br','hinova','hinova']:null;
 if(!profile)throw Object.assign(Error('APN ausente ou não reconhecida no cadastro. Atualize o aparelho antes de usar a configuração padrão.'),{status:422});
 return {apn:normalized,command:`ST300NTW;${serial};319H;0;${profile.join(';')};grupors1.ddns.net;5940;grupors1.ddns.net;5941;#`};
}
