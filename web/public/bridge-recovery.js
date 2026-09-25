export async function recoverBridge({health,read,active,progress=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=12}){
 for(let n=0;!health.ok&&n<attempts;n++){
  if(!active())return null;
  progress(n+1,attempts);await wait(5000);
  if(!active())return null;
  health=await read();
 }
 return health;
}
