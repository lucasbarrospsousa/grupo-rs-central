import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',name.endsWith('.js')||name.endsWith('.mjs')?'text/javascript':'text/html');res.end(name==='/'?'<div id="app"></div>':await readFile(new URL('../public'+name,import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const result=await page.evaluate(async()=>{
  const {mountSidebar}=await import('/sidebar.js'),{SqlRepository}=await import('/sql-repository.js'),{createStockLive}=await import('/stock-live.js');
  const menus={};for(const branch of ['imperatriz','araguaina','acailandia','maraba']){
   document.querySelector('#app').innerHTML='<div class="app-layout"><aside class="sidebar"></aside><main class="content"><header class="top"><div>Central</div></header></main></div>';
   mountSidebar({route:'stock',branch,icon:()=>'',navigate:()=>{},logout:()=>{},username:'test'});
   menus[branch]=[...document.querySelectorAll('[data-nav]')].map(x=>x.dataset.nav);
  }
  const repo=new SqlRepository();repo.devices=[{id:'one',branch:'imperatriz',iccid:'test'}];let queries=0;
  repo.request=async path=>{queries++;const kind=new URLSearchParams(path.split('?')[1]).get('kind');return{queried_at:new Date().toISOString(),results:[{id:'one',ok:true,...(kind==='chips'?{chip:{ok:true,iccid:'test',connectivity:'Online'}}:{location:{ok:true,updated_at:new Date().toISOString(),gps_at:new Date().toISOString(),ignition:'1'}})}]};};
  const mount=()=>{document.querySelector('#app').innerHTML='<div class="stock-card-heading"><small></small></div><div id="stock-body"><button data-detail="one"></button></div>';return createStockLive({repo,branch:'imperatriz',draw:()=>{},showModal:()=>{}});};
  let live=mount();live.refresh();await new Promise(r=>setTimeout(r,50));const first=queries;
  document.querySelector('#app').innerHTML='Outra página';await new Promise(r=>setTimeout(r,0));live=mount();live.refresh();await new Promise(r=>setTimeout(r,50));const returned=queries;
  live.refresh(true);await new Promise(r=>setTimeout(r,50));const refreshed=queries;
  document.querySelector('#app').innerHTML='';await repo.logout();
  return{menus,first,returned,refreshed,cacheCleared:repo.stockSamples.size===0};
 });
 for(const branch of Object.keys(result.menus))for(const route of ['warehouse','sms','link'])assert.equal(result.menus[branch].includes(route),branch==='imperatriz');
 assert.equal(result.first,2);assert.equal(result.returned,2);assert.equal(result.refreshed,4);assert.ok(result.cacheCleared);
 console.log('Browser passed: menus in four branches; stock return reuses both queries; explicit refresh and logout work. Synthetic data only.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
