import {randomUUID} from 'node:crypto';
export async function powerState(pool){return (await pool.query("select central_homologacao.server_power_gate('status') as power")).rows[0].power;}
export function powerUnavailable(state){return Response.json({error:'Central desligada pelo administrador. Aguarde a liberação pelo portal.',code:'SERVER_POWER_OFF',state},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'30'}});}
export async function withServerPower(pool,run,waitUntil){
 const id=randomUUID(),p=(await pool.query("select central_homologacao.server_power_gate('enter',$1) as power",[id])).rows[0].power;
 if(!p.allowed)return powerUnavailable(p.state);
 const pending=[];
 try{return await run(pending);}finally{
  const finish=async()=>{await Promise.allSettled(pending);await pool.query("select central_homologacao.server_power_gate('leave',$1)",[id]);};
  if(pending.length&&waitUntil)waitUntil(finish());else await finish();
 }
}
