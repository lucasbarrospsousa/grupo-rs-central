self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();const {route,branch}=event.notification.data||{};
 const target=new URL('/',self.location.origin);target.searchParams.set('alertRoute',route==='warehouse'?'warehouse':'stock');target.searchParams.set('alertBranch',String(branch||''));
 event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const existing=windows.find(w=>new URL(w.url).origin===target.origin);if(existing){existing.postMessage({type:'central-inventory-open',route:route==='warehouse'?'warehouse':'stock',branch});await existing.focus();}else await self.clients.openWindow(target.href);})());
});
