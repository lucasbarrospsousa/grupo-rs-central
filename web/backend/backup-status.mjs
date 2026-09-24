export async function backupStatus(pool,userId){
 const allowed=(await pool.query("select 1 from central_homologacao.memberships where user_id=$1 and role='admin' limit 1",[userId])).rowCount;
 if(!allowed)throw Object.assign(Error('Somente o administrador pode consultar os backups.'),{status:403});
 const control=(await pool.query('select enabled,state,account_email,next_run_at,lease_until,last_attempt_at,last_success_at,last_error,drive_checked_at,drive,retention_days from central_homologacao.backup_control where id')).rows[0];
 const runs=(await pool.query('select started_at,finished_at,state,bytes,tables_count,rows_count,restore_verified,error_code from central_homologacao.backup_runs order by started_at desc limit 5')).rows;
 return {...control,runs,scope:'Todas as filiais',schedule:'Diariamente às 02:17 (Brasília)'};
}
