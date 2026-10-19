// Saved SQL only; independent of chip/GPS rounds and works on an empty page.
export function savedStockWatch({read,changed,active,schedule=setTimeout,cancel=clearTimeout}){
 let timer,closed=false,busy=false;
 async function tick(){
  if(closed||busy)return;
  busy=true;
  try{if(active()&&await read()&&!closed&&active())changed();}catch{/* Retain the last good page; next tick retries. */}
  finally{busy=false;if(!closed)timer=schedule(tick,10000);}
 }
 timer=schedule(tick,10000);
 return ()=>{closed=true;cancel(timer);};
}
