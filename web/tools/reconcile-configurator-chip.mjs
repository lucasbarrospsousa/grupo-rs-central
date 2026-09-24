// Explicit one-chip reconciliation, read-only unless --apply is passed.
import {writeFileSync} from 'node:fs';
import {createPool,privatePath} from '../backend/database.mjs';
import {integrations} from '../backend/integrations.mjs';
import {consumeConfiguredChip} from '../backend/configurator-warehouse.mjs';
const arg=name=>process.argv[process.argv.indexOf(name)+1];
const branch=arg('--branch'),serial=arg('--serial'),iccid=arg('--iccid'),apply=process.argv.includes('--apply');
if(!['imperatriz','araguaina','acailandia','maraba'].includes(branch)||!/^024\d{6}$/.test(serial)||!/^89\d{17,18}$/.test(iccid))throw Error('Informe filial, série e ICCID completo.');
const remote=await integrations.equipmentPortal(branch,serial);
if(remote.serial!==serial||String(remote.iccid).replace(/\D/g,'')!==iccid)throw Error('Plataforma não confirmou a associação exata; nenhuma gravação.');
const p=createPool({admin:true}),c=await p.connect();
try{
 await c.query('BEGIN');await c.query("select pg_advisory_xact_lock(hashtext('central-configurator'))");
 const device=(await c.query('select id,data,version from central_homologacao.devices where serial=$1 and branch_id=$2 and deleted_at is null for update',[serial,branch])).rows[0];
 if(!device||device.data.iccid!==iccid||device.data.remote_registration_status!=='confirmado_configurador_rs300')throw Error('Cadastro do Configurador não confirmado na Central.');
 const audit=(await c.query("select user_id from central_homologacao.audit_events where entity_id=$1 and branch_id=$2 and action='RS300_CONFIGURATOR_SYNC' order by occurred_at desc limit 1",[device.id,branch])).rows[0];
 if(!audit)throw Error('Gravação original do Configurador não localizada.');
 const items=(await c.query("select * from central_homologacao.warehouse_items where kind='chip' and serial=$1 for update",[iccid])).rows;
 const movements=(await c.query('select * from central_homologacao.warehouse_movements where items @> $1::jsonb',[JSON.stringify([{serial:iccid}])])).rows;
 writeFileSync(privatePath('chip-reconcile-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json'),JSON.stringify({branch,serial,iccid,device,items,movements}),{flag:'wx'});
 const result=apply?await consumeConfiguredChip(c,{branch,serial,iccid,userId:audit.user_id}):{found:!!items.length,status:items[0]?.status,platformConfirmed:true};
 await c.query(apply?'COMMIT':'ROLLBACK');console.log(JSON.stringify({apply,serial,iccid,...result}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await p.end();}
