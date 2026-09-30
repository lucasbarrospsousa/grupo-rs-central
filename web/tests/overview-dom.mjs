// Run: JSDOM_MODULE=/path/to/jsdom/lib/api.js node web/tests/overview-dom.mjs
import assert from 'node:assert/strict';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const dom=new JSDOM('<div id="app"><div id="page"></div></div><dialog id="modal"></dialog>',{pretendToBeVisual:true,url:'https://central.test'});
for(const key of ['window','document','MutationObserver','Element'])globalThis[key]=dom.window[key];
globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);
Element.prototype.getClientRects=()=>[{}];
const animations=[];Element.prototype.animate=function(){animations.push(this);return {finished:Promise.resolve(),cancel(){}};};
const pending=[];
const repo={real:true,user:{branches:[{id:'a',name:'A'},{id:'b',name:'B'}]},request:path=>new Promise((resolve,reject)=>pending.push({path,resolve,reject}))};
const {installPageMotion}=await import('../public/page-motion.js');
const {mountLiveOverview}=await import('../public/overview-live.js');
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
const last=path=>pending.filter(x=>x.path===path).at(-1);
try{
 installPageMotion(repo);mountLiveOverview({repo,showModal(){},notify(){},render(){throw Error('Unexpected full render');}});
 const cards=[...document.querySelectorAll('[data-stock-base]')];
 last('devices?branch=a').resolve({rows:[{status:'Estoque'}]});await tick();
 assert.equal(cards[0].querySelector('.value').textContent,'1');
 assert.equal(animations.filter(x=>x===cards[0]).length,1,'ready card animates before other requests finish');
 last('integrations/maintenance?branch=a').resolve({count:2,rows:[]});await tick();
 const bar=document.querySelector('[data-base=a]');
 last('devices?branch=b').resolve({rows:[]});last('integrations/maintenance?branch=b').resolve({count:5,rows:[]});await tick();
 assert.equal(document.querySelector('#base-total').textContent,'7');
 assert.equal(document.querySelector('#base-chart').firstElementChild.dataset.base,'b');
 assert.equal(bar,document.querySelector('[data-base=a]'));
 assert.ok(cards.every(c=>c.isConnected&&animations.filter(a=>a===c).length===1));
 document.querySelector('#stock-bases-refresh').click();assert.equal(cards[0].querySelector('.value').textContent,'1');
 last('devices?branch=a').reject(Error('Offline'));last('devices?branch=b').resolve({rows:[{status:'Estoque'}]});await tick();
 assert.ok(cards.every(c=>c.isConnected&&animations.filter(a=>a===c).length===1));
 assert.match(document.querySelector('#stock-bases-progress').textContent,/Offline/);
 assert.equal(cards[1].querySelector('.value').textContent,'1');
 document.querySelector('#live-refresh').click();assert.equal(document.querySelector('#base-total').textContent,'7');
 last('integrations/maintenance?branch=a').resolve({count:9,rows:[]});await tick();last('integrations/maintenance?branch=b').resolve({count:1,rows:[]});await tick();
 assert.equal(document.querySelector('#base-total').textContent,'10');assert.equal(bar,document.querySelector('#base-chart').firstElementChild);
 console.log('PASS: incremental results, stable nodes, one animation, totals, sorting, manual refresh and partial failure');
}finally{dom.window.close();}
