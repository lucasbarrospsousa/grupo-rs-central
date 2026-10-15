import {readFile} from 'node:fs/promises';import {createPool} from '../backend/database.mjs';
const pool=createPool({admin:true});const sql=await readFile(new URL('../migrations/056_server_power.sql',import.meta.url),'utf8');
try{
 const c=await pool.connect();try{
  await c.query(sql.replace(/COMMIT;\s*$/,''));
  await c.query(`DO $$ DECLARE baseline jsonb; p jsonb; r uuid:='00000000-0000-4000-8000-000000000001'; BEGIN
   SELECT jsonb_agg(jsonb_build_object('id',jobid,'active',active) ORDER BY jobid) INTO baseline FROM cron.job;
   IF (SELECT state FROM central_homologacao.server_power WHERE id)<>'on' THEN RAISE EXCEPTION 'Test requires on state'; END IF;
   p:=central_homologacao.server_power_gate('enter',r);IF NOT (p->>'allowed')::boolean THEN RAISE EXCEPTION 'Enter failed';END IF;
   p:=public.central_server_power('off');IF p->>'state'<>'stopping' THEN RAISE EXCEPTION 'Did not drain';END IF;
   p:=central_homologacao.server_power_gate('enter',gen_random_uuid());IF (p->>'allowed')::boolean THEN RAISE EXCEPTION 'Accepted while stopping';END IF;
   IF EXISTS(SELECT FROM cron.job WHERE jobname IN ('central-background-sync','central-device-codes','central-maintenance-ignition') AND active) THEN RAISE EXCEPTION 'Jobs not paused';END IF;
   p:=central_homologacao.server_power_gate('leave',r);IF p->>'state'<>'off' THEN RAISE EXCEPTION 'Did not finish';END IF;
   p:=public.central_server_power('on');IF p->>'state'<>'on' THEN RAISE EXCEPTION 'Did not resume';END IF;
   IF baseline IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('id',jobid,'active',active) ORDER BY jobid) FROM cron.job) THEN RAISE EXCEPTION 'Schedules not preserved';END IF;
   IF has_function_privilege('central_homologacao_web','public.central_server_power(text)','EXECUTE') OR has_function_privilege('anon','public.central_server_power(text)','EXECUTE') THEN RAISE EXCEPTION 'Public control';END IF;
  END $$;`);
  await c.query('ROLLBACK');console.log('Power SQL rollback checks passed; operational state unchanged.');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 if(process.argv.includes('--apply')){await pool.query(sql);console.log('Power control installed; current state:',(await pool.query("select public.central_server_power('status') as power")).rows[0].power);}
}finally{await pool.end();}
