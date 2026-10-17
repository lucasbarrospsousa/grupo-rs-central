import {IndexedSnapshots} from './indexed-snapshots.js';
import {branchRouteVisible} from './branch-navigation.js';
const PREFIX='central-page-cache-v3:',MAX_AGE=24*60*60*1000;
export const canPreload=(user,branch,route)=>!!user?.branches?.some(b=>b.id===branch)&&branchRouteVisible(branch,route)&&(user.permissions?.owner||user.permissions?.views?.includes(route));
export function preloadPlan(user,branch){
 const routes=['stock','warehouse','maintenance','overview','tracking','records','route','link','bulk','sms'];
 const groups=new Set();for(const route of routes.filter(r=>canPreload(user,branch,r))){if(route==='warehouse')groups.add('warehouse');else if(route!=='sms'){groups.add('devices');if(route==='maintenance')groups.add('history');}}
 const paths=[];
 if(canPreload(user,branch,'settings')&&user.permissions?.owner)paths.push('settings-monitor','query-policy','read-sources');
 if(user?.permissions?.owner&&user.branches?.some(b=>b.id===branch))paths.push('users','logs?q=&user=&module=&outcome=&from=&to=&page=1');
 return {groups:[...groups],paths};
}
// Only application SQL snapshots. Never cache login, tokens, API calls or mutations.
export class PagePreloadCache{
 constructor({storage,persistent,now=Date.now}={}){try{this.storage=storage??globalThis.localStorage;}catch{}this.now=now;this.memory=new Map();this.key='';this.snapshots={};this.user=null;this.persistent=persistent??(!storage&&globalThis.indexedDB?new IndexedSnapshots():null);this.writes=Promise.resolve();this.generation=0;}
 async bind(user){
  await this.writes;this.user=user;try{this.logoutStamp=this.storage.getItem('central-cache-logout');}catch{}
  const identity=JSON.stringify([user.username,user.branches,user.permissions]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  this.key=PREFIX+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  try{for(let i=this.storage.length-1;i>=0;i--){const key=this.storage.key(i);if(key?.startsWith('central-page-cache-')&&key!==this.key)this.storage.removeItem(key);}const saved=JSON.parse(this.storage.getItem(this.key)||'{}');this.snapshots=saved&&typeof saved==='object'?saved:{};}catch{this.snapshots={};}
  if(this.persistent)try{await this.persistent.retain(this.key);this.snapshots=await this.persistent.get(this.key)||{};}catch{this.snapshots={};}
 }
 allowed(branch,group){return !!this.user&&(preloadPlan(this.user,branch).groups.includes(group)||group.startsWith('page:')&&canPreload(this.user,branch,'stock')||group==='summary'&&canPreload(this.user,branch,'overview'));}
 snapshot(branch,group){if(!this.allowed(branch,group))return null;const entry=this.snapshots[branch+':'+group];return entry&&entry.at<=this.now()&&this.now()-entry.at<MAX_AGE?entry.data:null;}
 save(branch,group,data){try{if(this.storage.getItem('central-cache-logout')!==this.logoutStamp)return;}catch{}if(!this.key||!this.allowed(branch,group))return;this.snapshots[branch+':'+group]={at:this.now(),data};try{for(const [key,e] of Object.entries(this.snapshots))if(this.now()-e.at>=MAX_AGE)delete this.snapshots[key];this.persist();}catch{}}
 drop(branch,groups){try{if(this.storage.getItem('central-cache-logout')!==this.logoutStamp){this.snapshots={};return;}}catch{}for(const group of groups)delete this.snapshots[branch+':'+group];this.persist();this.memory.clear();}
 dropSnapshots(){this.snapshots={};this.memory.clear();this.generation++;this.persist();}
 put(path,data){this.memory.set(path,{data:structuredClone(data),at:this.now()});}
 take(path){const entry=this.memory.get(path);this.memory.delete(path);return entry&&this.now()-entry.at<60000?structuredClone(entry.data):undefined;}
 persist(){if(!this.key)return;const key=this.key,generation=this.generation,snapshot=structuredClone(this.snapshots),valid=()=>{try{return generation===this.generation&&this.key===key&&this.storage.getItem('central-cache-logout')===this.logoutStamp;}catch{return generation===this.generation&&this.key===key;}};if(this.persistent){this.writes=this.writes.then(()=>valid()?this.persistent.put(key,snapshot,valid):undefined).catch(()=>{});}else try{const text=JSON.stringify(snapshot);if(text.length<=2000000)this.storage.setItem(key,text);else this.storage.removeItem(key);}catch{}}
 flush(){return this.writes;}
 clear(){this.generation++;if(this.persistent)this.writes=this.writes.then(()=>this.persistent.clear()).catch(()=>{});try{this.storage.setItem('central-cache-logout',crypto.randomUUID());for(let i=this.storage.length-1;i>=0;i--){const key=this.storage.key(i);if(key?.startsWith('central-page-cache-'))this.storage.removeItem(key);}}catch{}this.memory.clear();this.snapshots={};this.key='';this.user=null;}
}
