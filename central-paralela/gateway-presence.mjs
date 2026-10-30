// Keep exact live presence in memory; checkpoint unchanged heartbeats at most
// twice/minute. Dispatch receipts still use the original durable transaction.
const instances = new WeakMap();
export function gatewayPresence(storage, now = Date.now) {
 if (instances.has(storage)) return instances.get(storage);
 let device, persistedAt = 0;
 const stable = value => JSON.stringify({...value,lastHeartbeat:0});
 const wrapper = {
  async get(key) {
   if (key !== 'wa:device') return storage.get(key);
   if (!device) { device = await storage.get(key); persistedAt = device?.lastHeartbeat || 0; }
   return device;
  },
  async put(key,value) {
   if (key !== 'wa:device') return storage.put(key,value);
   if (!device || stable(device) !== stable(value) || now()-persistedAt >= 30000) {
    await storage.put(key,value); persistedAt = now();
   }
   device = structuredClone(value);
  },
  transaction(fn) { return storage.transaction(fn); }
 };
 instances.set(storage,wrapper); return wrapper;
}
