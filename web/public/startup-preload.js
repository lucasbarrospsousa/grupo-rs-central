import {canPreload,preloadPlan} from './page-preload.js';
import {warehouseDay} from './warehouse-model.js';
// Only bounded SQL views. Never supplier APIs, writes or complete inventory exports.
export function canonicalView(path){const [name,query]=path.split('?');if(query===undefined)return path;const p=new URLSearchParams(query);p.sort();return name+'?'+p;}
export function landingView(user){if(!user?.branches?.length)throw Error('Usuário sem filial autorizada.');return {branch:user.branches.find(b=>b.id==='imperatriz')?.id||user.branches[0].id,route:'overview'};}
export function warehousePreloadPaths(user,branch,now=new Date()){
 if(!canPreload(user,branch,'warehouse'))return [];
 const month=warehouseDay(now).slice(0,7),common={query:'',status:'Disponível',category:'',destination:'',page:0};
 return [{view:'overview',month},{view:'items',kind:'device',...common,month:''},{view:'chips',query:'',category:'',provider:'',status:'Disponível',page:0},{view:'movements',kind:'movements',...common,status:'shipments',month},{view:'monthly',month,months:6,destination:''}].map(p=>canonicalView('warehouse?'+new URLSearchParams({branch,...p})));
}
export function initialReadPlan(user,branch,now=new Date()){
 const views=warehousePreloadPaths(user,branch,now);
 if(canPreload(user,branch,'overview'))views.push(canonicalView('devices?'+new URLSearchParams({branch,scope:'discharges',month:warehouseDay(now).slice(0,7)})));
 if(canPreload(user,branch,'tracking'))views.push(canonicalView('devices?'+new URLSearchParams({branch,scope:'lookup',query:'',status:'',customer:'',page:1})));
 if(canPreload(user,branch,'maintenance'))views.push(canonicalView('history?'+new URLSearchParams({branch,view:'indicators',page:0,month:'',search:'',model:''})));
 if(canPreload(user,branch,'sms'))views.push('integrations/operations?branch='+encodeURIComponent(branch));
 return {views,summary:canPreload(user,branch,'overview'),stock:canPreload(user,branch,'stock'),paths:preloadPlan(user,branch).paths};
}
