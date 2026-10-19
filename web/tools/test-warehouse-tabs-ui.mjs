import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {selectWarehouseView} from '../backend/warehouse-view.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',p.endsWith('.css')?'text/css':/\.m?js$/.test(p)?'text/javascript':p.endsWith('.png')?'image/png':'text/html');res.end(p==='/mode.js'?"export default 'production'":await readFile(new URL('../public'+(p==='/'?'/index.html':p),import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1917,height:913}}),errors=[],calls=[],outside=[];
 page.on('pageerror',e=>errors.push(e.message));
 const rows=Array.from({length:30},(_,i)=>({id:'item-'+i,branch:'imperatriz',kind:i<23?'device':'chip',serial:'024TEST'+i,status:'Disponível',classification:i%2?'Reserva':'Estoque',received_at:'2026-10-01T12:00:00Z',chip_provider:'arya',version:1}));
 const movements=Array.from({length:12},(_,i)=>({id:'move-'+i,branch:'imperatriz',destination:i%2?'Araguaína':'Marabá',created_at:`2026-10-${String(i+1).padStart(2,'0')}T12:00:00Z`,items:[{serial:rows[i].serial,kind:'device',action:'Envio'}]}));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.hostname!=='127.0.0.1'){outside.push(url.hostname);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const endpoint=url.pathname.slice(5);let result={rows:[],movements:[]};
  if(endpoint==='session')result={username:'warehouse-tabs-test',csrf:'synthetic',lastActivityAt:new Date().toISOString(),branches:[{id:'imperatriz',name:'Imperatriz',role:'viewer'}],permissions:{owner:false,views:['warehouse'],writes:[]}};
  if(endpoint==='activity')result={lastActivityAt:new Date().toISOString()};
  if(endpoint==='warehouse'){
   assert.equal(req.method(),'GET');calls.push(Object.fromEntries(url.searchParams));
   result=url.searchParams.has('since')?{cursor:'1',unchanged:true}:{...selectWarehouseView({rows,movements},url.searchParams),cursor:'1'};
   await new Promise(r=>setTimeout(r,70));
  }
  assert.ok(!['warehouse-pending','chip-query','integration-query'].includes(endpoint));
  await route.fulfill({json:result});
 });
 await page.addInitScript(()=>localStorage.setItem('central-view:warehouse-tabs-test',JSON.stringify({branch:'imperatriz',route:'warehouse'})));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('.wo-chart svg').waitFor();
 await page.evaluate(()=>{window.testWarehouseNav=document.querySelector('.warehouse-views');window.testWarehouseOverview=document.querySelector('.warehouse-overview');});
 await page.locator('[data-warehouse-view="inventory"]').click();await page.locator('[data-item]').first().waitFor();assert.equal(await page.locator('[data-item]').count(),8);assert.equal(await page.locator('#warehouse-new').isDisabled(),true);assert.equal(await page.locator('[data-item]').first().isDisabled(),true);
 await page.locator('#warehouse-search').fill('024TEST22');await page.waitForFunction(()=>document.querySelectorAll('[data-item]').length===1);assert.match(await page.locator('#warehouse-table').innerText(),/024TEST22/);
 await page.locator('[data-warehouse-view="movements"]').click();await page.waitForFunction(()=>document.querySelector('#warehouse-table')?.textContent.includes('Marabá'));assert.equal(await page.locator('#warehouse-search').inputValue(),'');assert.equal(await page.locator('#warehouse-status').inputValue(),'shipments');
 await page.locator('#warehouse-next').click();await page.waitForFunction(()=>document.querySelector('#warehouse-pagination')?.textContent.includes('página 2'));
 await page.locator('[data-warehouse-view="analysis"]').click();await page.locator('.wm-chart').waitFor();
 await page.locator('[data-warehouse-view="chips"]').click();await page.locator('[data-ci-id]').first().waitFor();
 await page.locator('[data-warehouse-view="inventory"]').click();await page.locator('[data-item]').first().waitFor();assert.equal(await page.locator('#warehouse-search').inputValue(),'024TEST22');assert.equal(await page.locator('[data-item]').count(),1);
 await page.locator('[data-warehouse-view="overview"]').click();await page.locator('.wo-chart svg').waitFor();
 assert.equal(await page.evaluate(()=>window.testWarehouseNav===document.querySelector('.warehouse-views')&&window.testWarehouseOverview===document.querySelector('.warehouse-overview')),true);
 assert.equal(calls.filter(c=>c.view==='overview').length,1,'revisiting untouched mounted overview must not refetch');
 await page.locator('#warehouse-refresh').click();await page.waitForFunction(()=>document.querySelector('.warehouse-overview')?.getAttribute('aria-busy')!=='true');await page.waitForTimeout(200);
 assert.ok(calls.some(c=>c.view==='overview'&&c.since==='1'));
 await mkdir(new URL('../.sites-runtime/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/warehouse-tabs-optimized.png',import.meta.url))});
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 console.log(JSON.stringify({pass:true,views:calls.map(c=>c.view),domPreserved:true,permissionsPreserved:true,externalRequests:outside.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
