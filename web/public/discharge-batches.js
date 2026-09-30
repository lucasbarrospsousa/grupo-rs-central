// Fifty items per work group; two exact queries at a time, within the shared API budget.
// take=50 is pagination, not support for fifty serial numbers in the q parameter.
function wait(ms,signal){return new Promise(resolve=>{if(signal?.aborted)return resolve();const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});});}
export async function analyzeBatches(rows,{query,onResult,onBatch=()=>{},onWait=()=>{},signal,sleep=wait}){
 for(let offset=0;offset<rows.length&&!signal?.aborted;offset+=50){
  const batch=rows.slice(offset,offset+50);let next=0;onBatch(offset/50+1);
  async function worker(){while(next<batch.length&&!signal?.aborted){const row=batch[next++];let result,error;
   for(let attempt=0;attempt<3&&!signal?.aborted;attempt++){try{result=await query(row);error=null;break;}catch(e){error=e;if(e.status!==429||attempt===2)break;const delay=30000*(attempt+1);onWait(row,delay/1000);await sleep(delay,signal);}}
   if(!signal?.aborted)onResult(row,result,error);
  }}
  await Promise.all([worker(),worker()]);
 }
}
