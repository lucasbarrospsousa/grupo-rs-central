import {scoped} from './remote-actions.mjs';
import {bridgeHealth} from './sms-queue.mjs';

export async function integrationHealth(pool,user,branch){
 const sync=(await pool.query('select central_homologacao.sync_status() as status')).rows[0]?.status;
 if(!sync)throw Object.assign(Error('O servidor não retornou o estado da sincronização.'),{status:503});
 const result=await scoped(pool,user,async c=>{
  const sources=(await c.query(`
   select sample.source, count(*)::int as attempted,
    count(*) filter(where (sample.value->>'ok'='true' or (sample.source='equipment' and sample.value->>'serial'=d.serial and coalesce(sample.value->>'ok','true')<>'false')))::int as confirmed,
    max(o.checked_at) as checked_at,
    max(o.checked_at) filter(where (sample.value->>'ok'='true' or (sample.source='equipment' and sample.value->>'serial'=d.serial and coalesce(sample.value->>'ok','true')<>'false'))) as last_success_at
   from central_homologacao.device_observations o
   join central_homologacao.devices d on d.id=o.device_id and d.deleted_at is null
   cross join lateral (values
    ('equipment',o.data->'equipment'),('api',o.data->'location'),
    ('arya',case when o.data->'chip'->>'provider'='arya' then o.data->'chip' end),
    ('link',case when o.data->'chip'->>'provider'='link' then o.data->'chip' end)
   ) sample(source,value)
   where o.data->>'api_version'='2' and o.branch_id=$1 and o.checked_at>now()-interval '24 hours'
    and sample.value is not null and sample.value<>'null'::jsonb
   group by sample.source`,[branch])).rows;
  return {sources,gateway:await bridgeHealth(c,branch)};
 });
 return {...result,branch,checked_at:new Date().toISOString(),sync:{...sync,alerts:(sync.alerts||[]).filter(a=>['api:'+branch,'carrier:arya','carrier:link'].includes(a.source))}};
}

export async function testBranchConnections(service,branch){
 const checks=[['api',()=>service.api(branch,'/veiculos?skip=0&take=1')],['equipment',()=>service.api(branch,'/equipamentos?skip=0&take=1')]];
 return {branch,checks:await Promise.all(checks.map(async([source,run])=>{
  try{const result=await run();if(result?.ok===false)throw Error('Consulta recusada');return{source,ok:true,checked_at:new Date().toISOString()};}
  catch(e){return{source,ok:false,checked_at:new Date().toISOString(),message:e.credentialInvalid?'Credencial rejeitada. Confira o acesso no servidor.':'Não foi possível confirmar a conexão. Tente novamente ou confira o serviço.'};}
 }))};
}
