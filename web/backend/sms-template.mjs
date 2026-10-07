export function standardSms(serial,apn){
 if(!/^024\d{6}$/.test(serial))throw Object.assign(Error('Série 024 inválida.'),{status:422});
 const normalized=String(apn||'').trim().toLowerCase();
 const profile=['link','linksolutions.br'].includes(normalized)?['linksolutions.br','link','link']:['hinova','hinova.br'].includes(normalized)?['hinova.br','hinova','hinova']:null;
 if(!profile)throw Object.assign(Error('APN ausente ou não reconhecida no cadastro. Atualize o aparelho antes de usar a configuração padrão.'),{status:422});
 return {apn:normalized,command:`ST300NTW;${serial};319H;0;${profile.join(';')};grupors1.ddns.net;5940;grupors1.ddns.net;5941;#`};
}
export const SMS_BASES=['imperatriz','araguaina','acailandia','maraba'];
export async function prepareStandardSms(c,branch,serial){
 if(!SMS_BASES.includes(branch))throw Object.assign(Error('Base inválida.'),{status:422});
 const rows=(await c.query("select serial,data from central_homologacao.devices where branch_id=$1 and serial=$2 and deleted_at is null limit 2",[branch,serial])).rows;
 if(rows.length!==1||rows[0].serial!==serial)throw Object.assign(Error('Cadastro do aparelho não encontrado ou ambíguo nesta base.'),{status:409});
 return {...standardSms(serial,rows[0].data?.apn),serial,source:'cadastro'};
}
