import {batteryDashboard} from './battery-dashboard.mjs';
import {scoped} from './remote-actions.mjs';
export function batterySample(raw){
 if(raw?.ok!==true||raw.query_error)return null;
 let stamp=String(raw.updated_at||'').trim().replace(' ','T');
 if(/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(stamp)&&!/(Z|[+-]\d\d:?\d\d)$/i.test(stamp))stamp+='-03:00';
 if(!/^\d{4}-\d\d-\d\d[T ]/.test(stamp)||!Number.isFinite(Date.parse(stamp)))return null;
 const number=(v,max)=>v===null||v===undefined||String(v).trim()===''?null:Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=max?Number(v):null;
 const sample={at:stamp,external:number(raw.battery,100),internal:number(raw.internal_battery,100),voltage:number(raw.internal_battery_voltage,10),voltage_origin:String(raw.internal_battery_voltage_origin||'').slice(0,80),ignition:String(raw.ignition??'').slice(0,20),gps_at:String(raw.gps_at||'').slice(0,40),source:String(raw.data_source||'').slice(0,40)};
 return [sample.external,sample.internal,sample.voltage].every(v=>v===null)?null:sample;
}
export function captureBatteries(pool,service){
 return new Proxy(service,{get(target,key){const original=Reflect.get(target,key);if(!['stockCommunication','equipmentLocation'].includes(key)||typeof original!=='function')return typeof original==='function'?original.bind(target):original;
 return async(branch,serial,...args)=>{const result=await original.call(target,branch,serial,...args),sample=batterySample(result);if(sample)try{await pool.query('select central_homologacao.capture_battery($1,$2,$3)',[branch,serial,sample]);}catch{result.battery_history_warning='Não foi possível salvar esta leitura no histórico.';}return result;};}});
}
export async function batteryHistory(pool,user,permissions,params){
 if(['dashboard','events'].includes(params.get('view')))return batteryDashboard(pool,user,permissions,params);
 if(!permissions.owner&&!permissions.views.includes('stock'))throw Object.assign(Error('Sem acesso ao Estoque.'),{status:403});
 const branch=params.get('branch'),q=(params.get('q')||'').trim(),page=Number(params.get('page')||1);
 if(!['imperatriz','araguaina','acailandia','maraba'].includes(branch)||q.length>80||!Number.isInteger(page)||page<1||page>100000)throw Object.assign(Error('Filtro inválido.'),{status:400});
 const chart=params.get('view')==='chart',serial=params.get('serial')||'',after=params.get('after')||'0';
 if(chart&&(!/^\d{6,17}$/.test(serial)||!/^\d{1,19}$/.test(after)||BigInt(after)>9223372036854775807n))throw Object.assign(Error('Aparelho ou cursor inválido.'),{status:400});
 return scoped(pool,user,async c=>{
 if(!(await c.query('select 1 from central_homologacao.memberships where user_id=$1 and branch_id=$2',[user.user_id,branch])).rowCount)throw Object.assign(Error('Sem acesso à filial.'),{status:403});
 if(chart){const result=await c.query("select id::text,serial,model,sample,created_at from central_homologacao.battery_history where branch_id=$1 and serial=$2 and observed_at>=now()-interval '30 days' and id>$3::bigint order by id limit 1001",[branch,serial,after]);const rows=result.rows.slice(0,1000);return {rows,next:result.rows.length>1000?rows.at(-1).id:null};}
 const result=await c.query(`select count(*) over()::integer as total,serial,model,sample,created_at from central_homologacao.battery_history where branch_id=$1 and observed_at>=now()-interval '30 days' and ($2='' or position(lower($2) in lower(serial))>0) order by observed_at desc,id desc limit 50 offset $3`,[branch,q,(page-1)*50]);
 return {rows:result.rows,total:result.rows[0]?.total||0,page};
 });
}
