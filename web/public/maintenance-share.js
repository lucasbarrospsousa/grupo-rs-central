export function maintenanceShare(count,total){
 if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(total)||total<=0||count>total)return null;
 return count/total*100;
}
