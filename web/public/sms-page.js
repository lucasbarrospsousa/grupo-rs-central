import {mountConsult} from './consult-page.js';
import {createSmsPanel} from './sms-panel.js';
export {smsCounts} from './sms-panel-model.js';
export function mountSms(ctx){
 mountConsult(ctx);
 document.querySelector('.content>.top .stock-app-heading strong').textContent='Painel SMS';
 document.querySelector('.content>.top .stock-app-heading small').textContent='Início › Painel SMS';
 const panel=createSmsPanel(document.querySelector('#page'),{branchName:ctx.branchName,demo:!ctx.repo.real});
 if(!ctx.repo.real){panel.setRows(['queued','received','sending','delivered','sent','failed','indeterminate','expired','cancelled'].map((state,i)=>({id:'demo-'+i,state,serial:'02490000'+i,created_at:'2026-10-16T11:00:00-03:00',payload:{phone:'Telefone ilustrativo',command:'reset,123456'},result:{}})));document.querySelector('#sms-refresh').onclick=()=>ctx.notify('Dados demonstrativos. Nenhum gateway consultado.');}
}
