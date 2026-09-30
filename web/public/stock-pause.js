// Shared within this page: opening discharge analysis suspends visible-stock polling.
const listeners=new Set();let leases=0;
export function watchStockPause(fn){listeners.add(fn);fn(leases>0);return()=>listeners.delete(fn);}
export function pauseStockPolling(){leases++;for(const fn of listeners)fn(true);let released=false;return()=>{if(released)return;released=true;leases--;if(!leases)for(const fn of listeners)fn(false);};}
