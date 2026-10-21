import {normalize} from './integrations.mjs';
import {guardedIntegrations} from './background-sync.mjs';
import {trackQueries} from './query-usage.mjs';
import {randomUUID} from 'node:crypto';
export function chipLinkPage(data,skip){
 if(data?.ok!==true||!Array.isArray(data.equipamentos)||typeof data.paginacao?.temMais!=='boolean')throw Error('Página de aparelhos não confirmada');
 const more=data.paginacao.temMais,next=data.paginacao.proximoSkip;
 if(more&&(!Number.isInteger(next)||next<=skip||!data.equipamentos.length))throw Error('Paginação inconsistente');
 const rows=data.equipamentos.map(r=>{const n=normalize(r);if(!n.serial)throw Error('Série não confirmada');return {serial:n.serial,iccid:/^89\d{17,18}$/.test(n.iccid)?n.iccid:'',active:!['I','INATIVO','0'].includes(String(r.ativo||'').toUpperCase())};});
 return {rows,more,next:more?next:0};
}
export function warehouseLinkTick(pool,{service}={}){return trackQueries(pool,'automatic',async()=>{
 service=service||guardedIntegrations(pool,undefined,{captureCodes:false,apiOnly:true});let processed=0;
 for(let i=0;i<4;i++){
 const lease=randomUUID(),work=(await pool.query('select central_homologacao.warehouse_links_claim($1) as data',[lease])).rows[0].data;if(!work)return {processed};
 try{const result=chipLinkPage(await service.api(work.branch,'/equipamentos?skip='+work.skip+'&take=50'),work.skip);await pool.query('select central_homologacao.warehouse_links_save($1,$2,$3,$4)',[lease,JSON.stringify(result.rows),result.more,result.next]);processed+=result.rows.length;}
 catch{await pool.query('select central_homologacao.warehouse_links_fail($1)',[lease]);break;}
 }
 return {processed};
 },'warehouse');}
