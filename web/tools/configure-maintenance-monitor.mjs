import {createPool} from '../backend/database.mjs';
const enabled=process.argv[2]==='--enable';if(!enabled&&process.argv[2]!=='--pause')throw Error('Use --enable ou --pause.');
const pool=createPool({admin:true});try{
 if(!(await pool.query('select 1 from central_homologacao.migrations where version=27')).rowCount)throw Error('Migração 27 necessária.');
 const jobs=await pool.query("select jobid from cron.job where jobname='central-maintenance-ignition'");
 if(enabled&&!jobs.rowCount)await pool.query("select cron.schedule('central-maintenance-ignition','* * * * *','select central_homologacao.dispatch_maintenance()')");
 await pool.query('update central_homologacao.maintenance_control set enabled=$1 where id',[enabled]);
 console.log(enabled?'Coleta de ignição habilitada, independente do estoque.':'Coleta de ignição pausada; resultados preservados.');
}finally{await pool.end();}
