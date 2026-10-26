import {trackingDocument} from './drive.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export async function maintenance({input:b,user,config,document=trackingDocument}){
 if(!user?.permissions?.views?.includes('maintenance')||!user.branches?.some(x=>x.id===b.branch))fail(403,'Sem acesso às manutenções desta filial.');
 if(!['list','save','lookup'].includes(b.action))fail(400,'Ação inválida.');
 if(b.action==='save'&&!user.permissions.owner&&!user.permissions.writes?.includes('maintenance'))fail(403,'Sem permissão para salvar manutenção.');
 const doc=await document(config,b.branch);const rows=doc.data.maintenance||[];
 if(b.action==='lookup'){const q=String(b.search||'').trim().toLocaleLowerCase('pt-BR');return {rows:q?(doc.data.rows||[]).filter(r=>!r.deleted_at&&[r.serial,r.plate,r.identification].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(q))).slice(0,20).map(r=>Object.fromEntries(['id','serial','plate','identification','model','carrier','iccid','phone'].map(k=>[k,r[k]||'']))):[]};}
 if(b.action==='list')return {rows,branch:b.branch};
 if(!/^[a-f0-9-]{36}$/i.test(b.key||''))fail(400,'Chave inválida.');
 const v=b.values||{},safe={};
 for(const k of ['client','plate','currentSerial','vehicleType','reason','medium','cause','trackerModel','trackerVersion','carrier','chipType','iccid','phone','solutionKind','observation']){safe[k]=String(v[k]??'').trim();if(safe[k].length>(k==='observation'?6500:150))fail(400,'Campo muito longo.');}
 if(!safe.plate||!/^\d{6,17}$/.test(safe.currentSerial))fail(400,'Informe a identificação e a série válida.');
 if(safe.trackerVersion&&!/^\d+\.\d+\.\d+$/.test(safe.trackerVersion))fail(400,'Versão inválida. Use, por exemplo, 7.3.5.');
 const fingerprint=JSON.stringify({id:b.id||'',values:safe});
 const prior=(doc.data.maintenanceAudit||[]).find(x=>x.key===b.key);
 if(prior){if(prior.actor!==user.username||prior.fingerprint!==fingerprint)fail(409,'Chave já utilizada.');return {row:rows.find(x=>x.id===prior.id),replayed:true};}
 const row=b.id?rows.find(x=>x.id===b.id):null;if(b.id&&!row)fail(404,'Registro não encontrado.');
 if(row&&row.version!==b.version)fail(409,'Registro mudou. Recarregue antes de editar.');
 if(rows.length>=10000&&!row)fail(409,'Limite de registros atingido.');
 const now=new Date().toISOString(),result={...row,...safe,id:row?.id||crypto.randomUUID(),entry:row?.entry||now,updated_at:now,version:(row?.version||0)+1,actor:user.username};
 if(row)rows[rows.indexOf(row)]=result;else rows.push(result);
 doc.data.maintenance=rows;doc.data.maintenanceAudit??=[];
 if(doc.data.maintenanceAudit.length>=20000)fail(409,'Limite de auditoria atingido.');
 doc.data.maintenanceAudit.push({key:b.key,id:result.id,actor:user.username,fingerprint,at:now});await doc.save();return {row:result};
}
