import {branchRouteVisible} from './branch-navigation.js';
const PREFIX='central-page-cache-v1:';
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
 constructor({storage,now=Date.now}={}){try{this.storage=storage??globalThis.sessionStorage;}catch{}this.now=now;this.memory=new Map();this.key='';this.snapshots={};}
 async bind(user){
  const identity=JSON.stringify([user.username,user.csrf,user.branches,user.permissions]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
  this.key=PREFIX+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  try{for(let i=this.storage.length-1;i>=0;i--){const key=this.storage.key(i);if(key?.startsWith(PREFIX)&&key!==this.key)this.storage.removeItem(key);}const saved=JSON.parse(this.storage.getItem(this.key)||'{}');this.snapshots=saved&&typeof saved==='object'?saved:{};}catch{this.snapshots={};}
 }
 snapshot(branch,group){const entry=this.snapshots[branch+':'+group];return entry&&entry.at<=this.now()&&this.now()-entry.at<300000?entry.data:null;}
 save(branch,group,data){if(!this.key||!['devices','history','warehouse'].includes(group))return;this.snapshots[branch+':'+group]={at:this.now(),data};try{for(const [key,e] of Object.entries(this.snapshots))if(this.now()-e.at>=300000)delete this.snapshots[key];const text=JSON.stringify(this.snapshots);if(text.length<=2000000)this.storage.setItem(this.key,text);else this.storage.removeItem(this.key);}catch{}}
 drop(branch,groups){for(const group of groups)delete this.snapshots[branch+':'+group];try{if(this.key)this.storage.setItem(this.key,JSON.stringify(this.snapshots));}catch{}this.memory.clear();}
 dropSnapshots(){this.snapshots={};this.memory.clear();try{if(this.key)this.storage.removeItem(this.key);}catch{}}
 put(path,data){this.memory.set(path,{data:structuredClone(data),at:this.now()});}
 take(path){const entry=this.memory.get(path);this.memory.delete(path);return entry&&this.now()-entry.at<60000?structuredClone(entry.data):undefined;}
 clear(){try{if(this.key)this.storage.removeItem(this.key);}catch{}this.memory.clear();this.snapshots={};this.key='';}
}
