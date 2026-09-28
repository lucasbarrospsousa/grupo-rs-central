const fail=(status,message)=>Object.assign(Error(message),{status});
export const logModules=['overview','stock','maintenance','warehouse','tracking','records','route','sms','link','bulk','settings','users','logs'];
export function requestEvent(req,status){
 const url=new URL(req.url,'http://localhost'),parts=url.pathname.split('/').filter(Boolean),resource=parts[1];
 if(['backups','automation'].includes(resource)&&req.method==='GET')return null;
 if(!resource||['activity','session','logs','ui-event'].includes(resource))return null;
 const background=['sync-status','health','operations','gateway','stock','maintenance'];
 if(req.method==='GET'&&resource==='integrations'&&background.includes(parts[2]))return null;
 const module=({login:'access',logout:'access',devices:'stock',history:'maintenance',maintenance:'maintenance',warehouse:'warehouse','warehouse-transfer':'warehouse',install:'stock',users:'users',bulk:'bulk',backups:'settings',automation:'settings'})[resource]||'integrations';
 return {module,action:req.method+' /'+parts.slice(1).map(p=>/^[a-f0-9-]{36}$/.test(p)?':id':p.slice(0,60)).join('/'),outcome:status<400?'success':'failure',entity:/^[a-f0-9-]{36}$/.test(parts.at(-1))?parts.at(-1):'',details:{http_status:status},branch:url.searchParams.get('branch')};
}
export async function appendLog(pool,user,event){
 await pool.query('insert into central_homologacao.system_logs(user_id,username,branch_id,module,action,outcome,entity,details) values($1,$2,$3,$4,$5,$6,$7,$8)',[user?.user_id||null,user?.username||'Não autenticado',event.branch||null,event.module,event.action,event.outcome,event.entity||'',event.details||{}]);
}
export async function readLogs(pool,access,params){
 if(!access.owner)throw fail(403,'Somente o administrador pode consultar a auditoria.');
 const page=Math.max(1,Math.min(200,Math.floor(Number(params.get('page'))||1)));
 const from=params.get('from')||null,to=params.get('to')||null;
 for(const date of [from,to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw fail(400,'Período inválido.');
 if(from&&to&&from>to)throw fail(400,'O início deve ser anterior ao fim.');
 const values=[from?from+'T00:00:00-03:00':null,to?to+'T23:59:59.999-03:00':null,params.get('user')||null,params.get('module')||null,params.get('outcome')||null,(params.get('q')||'').slice(0,100)];
 const where="($1::timestamptz is null or occurred_at >= $1) and ($2::timestamptz is null or occurred_at <= $2) and ($3::text is null or username=$3) and ($4::text is null or module=$4) and ($5::text is null or outcome=$5) and ($6='' or strpos(lower(username||' '||action||' '||entity),lower($6))>0)";
 const c=await pool.connect();try{
 await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const stats=(await c.query(`select count(*)::int total,count(*) filter(where outcome='failure')::int failures,count(*) filter(where outcome='change')::int changes,count(distinct username)::int users from central_homologacao.system_logs where ${where}`,values)).rows[0];
 const rows=(await c.query(`select * from central_homologacao.system_logs where ${where} order by occurred_at desc,id desc limit 50 offset $7`,[...values,(page-1)*50])).rows;
 const storage=(await c.query("select count(*)::int retained,coalesce(sum(octet_length(to_jsonb(s)::text)),0)::bigint logical_bytes,pg_total_relation_size('central_homologacao.system_logs')::bigint allocated_bytes,pg_database_size(current_database())::bigint database_bytes from central_homologacao.system_logs s")).rows[0];
 const users=(await c.query('select distinct username from central_homologacao.system_logs order by username')).rows.map(r=>r.username);
 await c.query('COMMIT');return {rows,stats,storage,users,page,pageSize:50,retention:{records:10000,logicalBytes:8388608,providerAvailableBytes:null},checkedAt:new Date().toISOString()};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
// Buffer the response until the request event is saved, including errors and login.
// This also works with the Supabase Node-compatible response adapter.
export function audited(pool,handler){return async(req,res)=>{
 let status=200,head,output,ended=false;
 const buffered={setHeader:(...args)=>res.setHeader(...args),writeHead:(code,headers)=>{status=code;head=headers;},end:value=>{output=value;ended=true;}};
 const result=await handler(req,buffered),event=requestEvent(req,status);
 if(event){
  try{const data=JSON.parse(output);if(data?.ok===false||data?.error)event.outcome='failure';}catch{}
  try{await appendLog(pool,req.auditUser,event);}catch{res.setHeader('X-Central-Audit','unavailable');console.error('SYSTEM_AUDIT_WRITE_FAILED');}
 }
 if(ended){res.writeHead(status,head||{});res.end(output);}return result;
};}
