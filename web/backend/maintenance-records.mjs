import {randomUUID} from 'node:crypto';
import {symptoms,sources,solutions,causes,trackerModels,vehicleTypes,chipTypes} from '../public/maintenance-record.js';
const fail=(status,message)=>Object.assign(Error(message),{status});
const text=(v,max=120)=>{if(typeof v!=='string'||v.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))throw fail(400,'Campo do registro inválido.');return v.trim();};
const choice=(v,options)=>{if(!options.includes(v))throw fail(400,'Seleção inválida no registro.');return v;};
function snapshot(input={},replacement=false){
 const result={trackerModel:choice(input.trackerModel,trackerModels),trackerVersion:text(input.trackerVersion,30),carrier:text(input.carrier,80),chipType:choice(input.chipType,chipTypes),iccid:text(input.iccid,22),phone:text(input.phone,22)};
 if(result.trackerVersion&&(result.trackerModel!=='RS300'||!/^\d+\.\d+\.\d+$/.test(result.trackerVersion)))throw fail(400,'Informe uma versão exata do RS300 ou deixe a versão em branco.');
 if(result.iccid&&!/^\d{18,22}$/.test(result.iccid))throw fail(400,'ICCID inválido; preserve os zeros iniciais.');
 if(!replacement){result.vehicleType=choice(input.vehicleType,vehicleTypes);result.vehicleModel=text(input.vehicleModel);}
 return result;
}
export function validateRecord(body){
 if(body.visit_version!==3)throw fail(409,'Atualize a página para usar o novo registro de manutenção.');
 const data={visit_version:3,reason:choice(body.reason,symptoms),medium:choice(body.medium,sources),notes:text(body.notes,2000),cause:choice(body.cause,causes),diagnosis:text(body.diagnosis,2000),incident:snapshot(body.incident)};
 if(Object.hasOwn(body,'observation'))data.observation=text(body.observation,6500);
 const r=body.resolution||{},kind=choice(r.kind,solutions),swapsDevice=kind.includes('Troca de aparelho'),swapsChip=kind.includes('chip');
 const chosen={...r,...(!swapsDevice?{trackerModel:'Não informado',trackerVersion:''}:{}),...(!swapsChip?{carrier:'',chipType:'Não informado',iccid:'',phone:''}:{})};
 data.resolution={...snapshot(chosen,true),kind,notes:text(r.notes,2000),serial:swapsDevice?text(r.serial,17):'',disposition:swapsDevice?text(r.disposition,80):''};
 if(swapsDevice&&!/^\d{6,17}$/.test(data.resolution.serial))throw fail(400,'Informe a série do aparelho instalado.');
 return data;
}
export async function maintenanceRecord(c,{path,method,body,branch,role}){
 if(branch!=='imperatriz')throw fail(403,'Manutenções disponível somente em Imperatriz.');
 if(role==='reader')throw fail(403,'Usuário somente de leitura.');
 const data=validateRecord(body);
 if(method==='POST'){
  const client=text(body.clientName),plate=text(body.plate,20).toUpperCase(),serial=text(body.currentSerial,17);
  if(!client||!plate||!/^\d{6,17}$/.test(serial))throw fail(400,'Informe cliente, placa e série do aparelho na ocorrência.');
  if(data.resolution.serial===serial)throw fail(400,'Aparelho instalado deve ser diferente do retirado.');
  const id=randomUUID();
  // A report is a historical snapshot, never an installation, discharge or remote command.
  await c.query('insert into central_homologacao.visits(id,branch_id,device_id,data) values($1,$2,$3,$4)',[id,branch,null,{...data,client,plate,currentSerial:serial,installSerial:data.resolution.serial,entry:new Date().toISOString(),identity_source:body.manual===true?'manual':'selected'}]);
  return{id,response:{ok:true,id}};
 }
 const id=path.split('/').at(-1),existing=(await c.query('select data,version from central_homologacao.visits where id=$1 and branch_id=$2 for update',[id,branch])).rows[0];
 if(!existing||!Number.isInteger(body.version)||existing.version!==body.version)throw fail(409,'Registro alterado por outra sessão. Atualize a lista.');
 if(data.resolution.serial===existing.data.currentSerial)throw fail(400,'Aparelho instalado deve ser diferente do retirado.');
 // Keep legacy identity, admission date, audit and discharge evidence intact.
 const result=await c.query('update central_homologacao.visits set data=data||$4::jsonb,version=version+1,updated_at=now() where id=$1 and branch_id=$2 and version=$3 returning id',[id,branch,body.version,JSON.stringify(data)]);
 if(!result.rowCount)throw fail(409,'Registro alterado por outra sessão. Atualize a lista.');
 return{id,response:{ok:true,id}};
}
