export function standardSms(serial,apn,branch='imperatriz'){
 if(!/^024\d{6}$/.test(serial))throw Object.assign(Error('Série 024 inválida.'),{status:422});
 const normalized=String(apn||'').trim().toLowerCase();
 const profile=['link','linksolutions.br'].includes(normalized)?['linksolutions.br','link','link']:['hinova','hinova.br'].includes(normalized)?['hinova.br','hinova','hinova']:null;
 if(!profile)throw Object.assign(Error('APN ausente ou não reconhecida no cadastro. Atualize o aparelho antes de usar a configuração padrão.'),{status:422});
 const host={imperatriz:'grupors1.ddns.net',araguaina:'grupors2.ddns.net',acailandia:'grupors3.ddns.net',maraba:'grupors4.ddns.net'}[branch];
 if(!host)throw Object.assign(Error('Configuração padrão desta filial ainda não validada. Use um comando conferido.'),{status:422});
 return {apn:normalized,branch,host,command:`ST300NTW;${serial};319H;0;${profile.join(';')};${host};5940;${host};5941;#`};
}
