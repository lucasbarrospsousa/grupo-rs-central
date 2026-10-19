import {initialReadPlan,canonicalView} from '../public/startup-preload.js';
import {devicePage} from './device-page.mjs';
import {warehouseView} from './warehouse-view.mjs';
import {historyView} from './history-view.mjs';
import {readLogs} from './system-logs.mjs';
import {manageUsers} from './user-access.mjs';
import {summarizeCosts,summarizeInvoices} from './warehouse-costs.mjs';
import {costView} from './cost-view.mjs';
export function bundlePaths(user,permissions,branches,branch){
 if(!branches.some(b=>b.id===branch))throw Object.assign(Error('Sem acesso a esta filial.'),{status:403});
 const plan=initialReadPlan({...user,branches,permissions},branch),paths=[...plan.views,...plan.paths];
 if(plan.summary)paths.unshift('devices?scope=summary&branch='+branch);
 if(plan.stock)paths.push('devices?'+new URLSearchParams({branch,scope:'page',query:'',status:'Todos',start:'',end:'',sort:'default',direction:-1,page:1}));
 if(permissions.owner&&plan.views.some(p=>p.startsWith('warehouse?')))paths.push('warehouse-costs?branch='+branch+'&view=summary');
 return [...new Set(paths.map(canonicalView))];
}
async function readPanel(c,path,branch,user,permissions){
 const [endpoint,query]=path.split('?'),p=new URLSearchParams(query);
 if(endpoint==='devices')return devicePage(c,branch,p);
 if(endpoint==='warehouse')return warehouseView(c,branch,p);
 if(endpoint==='history')return historyView(c,branch,p);
 if(endpoint==='integrations/operations')return {rows:(await c.query('select id,kind,serial,state,result,created_at,updated_at,payload from central_homologacao.remote_operations where branch_id=$1 and kind=any($2::text[]) order by created_at desc limit 100',[branch,['link','sms'].filter(k=>permissions.owner||permissions.views.includes(k))])).rows};
 if(endpoint==='users')return manageUsers(c,permissions,'GET',null,{},user);
 if(endpoint==='logs')return readLogs(null,permissions,p,{client:c});
 if(endpoint==='read-sources')return {branches:(await c.query('select branch_id,mode from central_homologacao.read_sources order by branch_id')).rows};
 if(endpoint==='settings-monitor')return (await c.query("select central_homologacao.settings_monitor() || jsonb_build_object('code_progress',central_homologacao.settings_code_progress()) as data")).rows[0].data;
 if(endpoint==='query-policy')return (await c.query('select central_homologacao.query_policy_status() as data')).rows[0].data;
 if(endpoint==='warehouse-costs'){
 const devices=(await c.query("select branch_id,serial,data->>'iccid' as iccid,data->>'apn' as apn,data->>'plate' as plate from central_homologacao.devices where deleted_at is null order by branch_id,serial")).rows;
 const costs=(await c.query('select provider,items,invoices,checked_at,last_attempt,last_error,refresh_until from central_homologacao.chip_cost_snapshots order by provider')).rows.map(r=>({...r,rows:new Map(r.items.map(x=>[x.iccid,x]))}));
 const inventory=(await c.query("select serial as iccid,usage_device_serial as serial from central_homologacao.warehouse_items where branch_id=$1 and kind='chip' and deleted_at is null",[branch])).rows;
 return costView({...summarizeCosts(devices,costs,{allProviders:true}),billing:summarizeInvoices(costs),inventory_items:summarizeCosts(inventory,costs).items,branch},p);
 }
 throw Error('Painel não permitido.');
}
export async function startupBundle(pool,user,permissions,branch,{reader=readPanel}={}){
 const start=performance.now(),branches=(await pool.query('select branch_id as id,role from central_homologacao.memberships where user_id=$1',[user.user_id])).rows;
 const paths=bundlePaths(user,permissions,branches,branch),panels=new Array(paths.length);let next=0;
 const worker=async()=>{
  const c=await pool.connect();try{
   await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("select set_config('central.user_id',$1,true)",[user.user_id]);
   while(next<paths.length){const i=next++,path=paths[i],t=performance.now();await c.query('SAVEPOINT panel_read');
    try{const data=await reader(c,path,branch,user,permissions);panels[i]={path,ok:true,data,ms:Math.round(performance.now()-t)};}
    catch{await c.query('ROLLBACK TO SAVEPOINT panel_read');panels[i]={path,ok:false,error:'Painel indisponível nesta consulta.',ms:Math.round(performance.now()-t)};}
    await c.query('RELEASE SAVEPOINT panel_read');
   }
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
 if(paths.length)await Promise.all(Array.from({length:Math.min(2,paths.length)},worker));
 return {ok:panels.every(p=>p.ok),branch,panels,serverMs:Math.round(performance.now()-start),source:'saved-sql',experimental:true};
}
