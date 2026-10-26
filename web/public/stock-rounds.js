// One visible device at a time; chip and communication can finish independently.
export function stockRounds({query,onResult,onStart=()=>{},onState=()=>{},schedule=setTimeout,cancel=clearTimeout}){
 let ids=[],key='',timer=null,controller=null,generation=0,closed=false,paused=false,completed=0;
 function stop(){generation++;cancel(timer);timer=null;controller?.abort();controller=null;}
 function wait(ms){if(closed||paused||!ids.length)return;onState(ms===1300?'waiting':'interval',{completed,total:ids.length});timer=schedule(()=>{timer=null;void round();},ms);}
 async function round(){
  const epoch=generation,current=new AbortController();controller=current;completed=0;onState('running',{completed,total:ids.length});
  const valid=()=>!closed&&!paused&&generation===epoch&&!current.signal.aborted;
  for(const id of ids){
   if(!valid())break;
   await Promise.all(['locations','chips'].map(async kind=>{
    if(!valid())return;onStart(id,kind);
    try{const data=await query(id,kind,current.signal);if(valid())onResult(id,kind,data);}
    catch(error){if(valid())onResult(id,kind,{results:[{id,ok:false,message:error.message}]});}
   }));
   if(valid()){completed++;onState('running',{completed,total:ids.length});}
  }
  if(valid()){controller=null;wait(30000);}
 }
 return {
  set(next,{force=false,context=''}={}){if(closed)return;next=[...new Set(next)].slice(0,50);const nextKey=JSON.stringify([context,next]);if(!force&&key===nextKey)return;stop();ids=next;key=nextKey;completed=0;if(!ids.length)onState('empty',{completed:0,total:0});wait(1300);},
  suspend(){stop();key='';ids=[];},
  pause(value){if(paused===value||closed)return;paused=value;stop();if(!paused)wait(1300);else onState('paused',{completed,total:ids.length});},
  close(){closed=true;stop();ids=[];}
 };
}
