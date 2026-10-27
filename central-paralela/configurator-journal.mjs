import {encryptUsers,decryptUsers} from './auth-crypto.mjs';
import {applyConfigChange} from './configurator.mjs';
// Caller holds the global writer lock. Intent is encrypted before the first write.
export async function recoverConfig({storage,key,document}){
 const envelope=await storage.get('configurator-intent');if(!envelope)return null;
 const plan=await decryptUsers(envelope,key);
 for(const branch of [...new Set(plan.changes.map(c=>c.branch))]){
  const doc=await document(branch);
  for(const change of plan.changes.filter(c=>c.branch===branch))applyConfigChange(doc.data,change,plan);
  await doc.save();
  const check=await document(branch);
  if(JSON.stringify(check.data)!==JSON.stringify(doc.data))throw Error('Drive readback did not confirm transaction');
 }
 await storage.delete('configurator-intent');return plan.response;
}
export async function commitConfig(plan,options){
 if(await options.storage.get('configurator-intent'))throw Error('Pending recovery');
 await options.storage.put('configurator-intent',await encryptUsers(plan,options.key));
 return recoverConfig(options);
}
