import {consumeConfiguredChip} from './configurator-warehouse.mjs';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {scoped} from './remote-actions.mjs';
import {integrations} from './integrations.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const branches=['imperatriz','araguaina','acailandia','maraba'];
const digits=v=>String(v||'').replace(/\D/g,'');
const phone=v=>digits(v).replace(/^55(?=\d{10,11}$)/,'');
export function validateConfigurator(p){
 if(!branches.includes(p.branch)||typeof p.serial!=='string'||! /^(?:[0-9]{9}|[0-9]{15})$/.test(p.serial))throw fail(400,'Filial ou série RS300 inválida.');
 if(p.status!==undefined&&!['Estoque','Reserva','Instalado','Manutenção'].includes(p.status))throw fail(400,'Situação do Configurador inválida.');
 if(p.action==='preflight')return;
 if(p.tracker_version&&!/^V7\.\d+\.\d+$/.test(p.tracker_version))throw fail(400,'Versão física inválida.');
 if(!['hinova.br','linksolutions.br'].includes(p.apn??'hinova.br'))throw fail(400,'APN do Configurador inválida.');
 if(!['prepare','save'].includes(p.action)||!/^89\d{17,18}$/.test(p.iccid||'')||!/^\d{10,13}$/.test(p.phone||'')||!['VIVO','TIM','CLARO','MULTIOPERADORA','MULTI OPERADORA'].includes(p.operator)||!Number.isInteger(p.version)||p.version<0||!/^[a-f0-9-]{36}$/.test(p.key||''))throw fail(400,'Dados de sincronização inválidos.');
}
async function inspect(c,p,user){
 const matches=(await c.query('select id,branch_id,serial,data,version from central_homologacao.devices where serial=$1 and deleted_at is null',[p.serial])).rows;
 if(matches.length>1)throw fail(409,'Série duplicada entre filiais. Confira os cadastros antes de transferir.');
 const old=matches[0];
 if(old&&old.branch_id!==p.branch){
  const origin=(await c.query('select role from central_homologacao.memberships where user_id=$1 and branch_id=$2',[user.user_id,old.branch_id])).rows[0];
  if(!origin||!['operator','admin'].includes(origin.role))throw fail(403,'Transferência exige autorização também na filial de origem.');
 }else if(old&&p.branch!=='imperatriz'&&old.data.status==='Instalado'&&p.status===undefined)throw fail(409,'Aparelho instalado na filial. Gravação automática bloqueada.');
 return old;
}
export function configuredData(old,p){
 const transfer=old?.branch_id&&old.branch_id!==p.branch;
 // Branch-specific links belong to the origin history, never to the new stock.
 if(transfer)old={data:{model:old.data.model,tracker_version:old.data.tracker_version}};
 const status=p.status??(p.branch!=='imperatriz'?'Estoque':old&&!transfer?'Manutenção':'Reserva');
 return{...(old?.data||{}),serial:p.serial,iccid:p.iccid,phone:p.phone,carrier:p.operator,model:p.tracker_version||old?.data.model||'RS300',...(p.tracker_version?{tracker_version:p.tracker_version}:{}),apn:p.apn??'hinova.br',status,quantity:status==='Estoque'?1:0,stock:status==='Estoque'?1:0,installed_at:status==='Instalado'?(old?.data.installed_at||''):'',updated_at:new Date().toISOString(),remote_registration_status:'confirmado_configurador_rs300',...(old&&!transfer?{}:{plate:'',client:'',identification:''})};
}
export async function configuratorOperation(pool,user,p,service=integrations){
 validateConfigurator(p);
 const fingerprint=createHash('sha256').update(JSON.stringify([p.branch,p.serial,p.iccid,p.phone,p.operator,p.version,...(p.apn==='linksolutions.br'?[p.apn]:[]),...(p.tracker_version?[p.tracker_version]:[]),...(p.status!==undefined?[p.status]:[])])).digest('hex');
 const read=fn=>scoped(pool,user,fn);
 const member=await read(async c=>(await c.query('select role from central_homologacao.memberships where user_id=$1 and branch_id=$2',[user.user_id,p.branch])).rows[0]);
 if(!member||!['operator','admin'].includes(member.role))throw fail(403,'Filial não autorizada para o Configurador.');
 if(p.action==='preflight'){const old=await read(c=>inspect(c,p,user));return{ok:true,branch:p.branch,version:old?.version||0,exists:!!old,database:'Central online'};}
 const replay=async c=>{const r=(await c.query('select fingerprint,response from central_homologacao.requests where user_id=$1 and request_key=$2',[user.user_id,p.key])).rows[0];if(r&&r.fingerprint!==fingerprint)throw fail(409,'Pedido reutilizado com dados diferentes.');return r?.response;};
 if(p.action==='prepare')return read(async c=>{
  await c.query("select pg_advisory_xact_lock(hashtext('central-configurator'))");
  const previous=await replay(c);if(previous)return previous;
  const old=await inspect(c,p,user);if((old?.version||0)!==p.version)throw fail(409,'Cadastro mudou. Faça nova conferência antes de gravar.');
  const result={ok:true,pending:true,confirmed:false,branch:p.branch,serial:p.serial,message:'Dados recebidos na Central; aguardando confirmação da plataforma.',payload:{serial:p.serial,iccid:p.iccid,phone:p.phone,operator:p.operator,apn:p.apn??'hinova.br',tracker_version:p.tracker_version||'',...(p.status!==undefined?{status:p.status}:{})}};
  await c.query('insert into central_homologacao.requests values($1,$2,$3,$4,now())',[user.user_id,p.key,fingerprint,result]);
  return result;
 });
 const previous=await read(replay);if(previous&&!previous.pending)return previous;
 const before=await read(c=>inspect(c,p,user));if((before?.version||0)!==p.version)throw fail(409,'Cadastro mudou. Faça nova conferência antes de gravar.');
 const remote=await service.equipmentPortal(p.branch,p.serial);
 if(remote.serial!==p.serial||digits(remote.iccid)!==p.iccid||phone(remote.phone)!==phone(p.phone))throw fail(409,'Série, chip ou telefone não confirmado na plataforma. Nenhuma gravação realizada.');
 return read(async c=>{
  await c.query("select set_config('central.chip_source','Configurador RS300',true)");
  // Serialise all Configurador operations, including conflicts on a shared chip.
  await c.query("select pg_advisory_xact_lock(hashtext('central-configurator'))");
  const saved=await replay(c);if(saved&&!saved.pending)return saved;
  const old=await inspect(c,p,user);if((old?.version||0)!==p.version)throw fail(409,'Cadastro mudou durante a conferência.');
  const conflict=await c.query("select id from central_homologacao.devices where data->>'iccid'=$1 and serial<>$2 and deleted_at is null limit 1",[p.iccid,p.serial]);if(conflict.rowCount)throw fail(409,'Chip associado a outro aparelho na Central.');
  const transferring=!!old&&old.branch_id!==p.branch;
  if(transferring){
   const pending=await c.query("select id from central_homologacao.remote_operations where serial=$1 and branch_id=$2 and state in ('prepared','submitted','queued','pending','received','sending','indeterminate') limit 1",[p.serial,old.branch_id]);
   if(pending.rowCount)throw fail(409,'Há uma operação pendente na origem. Conclua ou confira antes de transferir.');
  }
  const same=old&&!transferring&&(!p.tracker_version||old.data.tracker_version===p.tracker_version)&&old.data.iccid===p.iccid&&phone(old.data.phone)===phone(p.phone)&&old.data.carrier===p.operator&&old.data.apn===(p.apn??'hinova.br')&&old.data.remote_registration_status==='confirmado_configurador_rs300'&&(p.status!==undefined?old.data.status===p.status:(p.branch==='imperatriz'?['Reserva','Manutenção'].includes(old.data.status):old.data.status==='Estoque'));
  const id=old?.id||randomUUID();let version=old?.version||1,status=old?.data.status;
  if(!same){const data=configuredData(old,p);status=data.status;
   if(old){const changed=await c.query('update central_homologacao.devices set data=$1,version=version+1,updated_at=now(),branch_id=$4 where id=$2 and version=$3 and deleted_at is null returning version',[data,id,p.version,p.branch]);if(!changed.rowCount)throw fail(409,'Cadastro mudou durante a gravação.');version=changed.rows[0].version;}
   else await c.query('insert into central_homologacao.devices(id,branch_id,serial,data) values($1,$2,$3,$4)',[id,p.branch,p.serial,data]);
   await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[p.branch,user.user_id,'RS300_CONFIGURATOR_SYNC',id,{previousVersion:p.version,status,source:'Configurador RS300',before:old?.data||null}]);
   if(transferring){
    const observation=(await c.query('select central_homologacao.take_transfer_observation($1,$2,$3) as snapshot',[id,old.branch_id,p.branch])).rows[0].snapshot;
    const transfer={serial:p.serial,from:old.branch_id,to:p.branch,previousVersion:p.version,version,before:old.data,observation,source:'Configurador RS300'};
    for(const branch of [old.branch_id,p.branch])await c.query('insert into central_homologacao.audit_events(branch_id,user_id,action,entity_id,details) values($1,$2,$3,$4,$5)',[branch,user.user_id,'RS300_CONFIGURATOR_TRANSFER',id,transfer]);
    // Historical observations are in the audit; the live destination must not
    // display cached chip/GPS/owner information from another platform.
   }
   if(old&&status==='Manutenção')await c.query('insert into central_homologacao.visits(id,branch_id,device_id,data) values($1,$2,$3,$4)',[randomUUID(),p.branch,id,{serial:p.serial,currentSerial:p.serial,plate:old.data.plate||'',client:old.data.client||'',status:'Em análise',entry:new Date().toISOString(),medium:'Configurador RS300',reason:'Reconfiguração de aparelho',notes:'Chip, telefone e operadora confirmados na plataforma.'}]);
  }
  const confirmed=(await c.query('select data,version from central_homologacao.devices where id=$1',[id])).rows[0];if(confirmed.data.iccid!==p.iccid||confirmed.version!==version||(p.status!==undefined&&confirmed.data.status!==p.status))throw fail(500,'Releitura SQL não confirmou a gravação.');
  const warehouse=await consumeConfiguredChip(c,{branch:p.branch,serial:p.serial,iccid:p.iccid,userId:user.user_id});
  const result={warehouse,ok:true,confirmed:true,created:!old,already_exists:!!same,id,version,status,branch:p.branch,...(transferring?{transferred:true,previous_branch:old.branch_id}:{}),database:'Central online',message:transferring?'Transferência e releitura confirmadas na Central online. Histórico da origem preservado.':same?'Registro online já confirmado; nenhuma alteração repetida.':'Gravação e releitura confirmadas na Central online.'};
  await c.query('insert into central_homologacao.requests values($1,$2,$3,$4,now()) on conflict (user_id,request_key) do update set response=excluded.response',[user.user_id,p.key,fingerprint,result]);return result;
 });
}
export async function configuratorFetch(request,pool){
 const expected=Buffer.from(process.env.CENTRAL_CONFIGURATOR_TOKEN||''),actual=Buffer.from(request.headers.get('x-central-configurator')||'');
 if(request.method!=='POST'||expected.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({ok:false,message:'Acesso do Configurador não autorizado.'},{status:401});
 try{let text='';const decoder=new TextDecoder();if(request.body)for await(const chunk of request.body){text+=decoder.decode(chunk,{stream:true});if(text.length>4096)throw fail(413,'Pedido excedeu o limite.');}text+=decoder.decode();const p=JSON.parse(text),user={user_id:process.env.CENTRAL_CONFIGURATOR_USER};if(!user.user_id)throw fail(503,'Configuração do servidor pendente.');return Response.json(await configuratorOperation(pool,user,p));}catch(e){return Response.json({ok:false,stage:'central_online',message:e.status?e.message:'Gravação online não confirmada. Repita somente a etapa pendente.'},{status:e.status||503});}
}
