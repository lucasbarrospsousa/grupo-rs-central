// Fifty items per work group; two exact queries at a time, within the shared API budget.
// take=50 is pagination, not support for fifty serial numbers in the q parameter.
export async function analyzeBatches(rows,{query,onResult,onBatch=()=>{},signal}){
 for(let offset=0;offset<rows.length&&!signal?.aborted;offset+=50){
  const batch=rows.slice(offset,offset+50);let next=0;onBatch(offset/50+1);
  async function worker(){while(next<batch.length&&!signal?.aborted){const row=batch[next++];let result,error;try{result=await query(row);}catch(e){error=e;}if(!signal?.aborted)onResult(row,result,error);}}
  await Promise.all([worker(),worker()]);
 }
}
