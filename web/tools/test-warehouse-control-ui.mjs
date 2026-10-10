import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',p.endsWith('.css')?'text/css':/\.m?js$/.test(p)?'text/javascript':p.endsWith('.png')?'image/png':'text/html');res.end(p==='/mode.js'?"export default 'production'":await readFile(new URL('../public'+(p==='/'?'/index.html':p),import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1917,height:913}}),errors=[],writes=[];
 const rows=[{id:'11111111-1111-4111-8111-111111111111',kind:'chip',serial:'8955000000000000001',status:'Disponível',classification:'Emergência',chip_provider:'link',chip_operator:'Vivo',version:1},{id:'22222222-2222-4222-8222-222222222222',kind:'chip',serial:'8955000000000000002',status:'Disponível',classification:'Estoque',chip_provider:'arya',chip_operator:'Claro',version:1},{id:'33333333-3333-4333-8333-333333333333',kind:'chip',serial:'8955000000000000003',status:'Utilizado',classification:'Emergência',chip_provider:'link',chip_operator:'Vivo',version:1}].map(r=>({...r,branch:'imperatriz',received_at:'2026-10-08T10:00:00Z'}));
 rows[2].usage_branch='araguaina';rows[2].usage_device_serial='024000001';rows[2].usage_detected_at='2026-10-10T12:00:00Z';
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.slice(5);let result={rows:[],visits:[],movements:[]};
  if(p==='session')result={username:'warehouse-ui',csrf:'synthetic',lastActivityAt:new Date().toISOString(),branches:[{id:'imperatriz',name:'Imperatriz',role:'admin'},{id:'araguaina',name:'Araguaína',role:'admin'},{id:'acailandia',name:'Açailândia',role:'admin'},{id:'maraba',name:'Marabá',role:'admin'}],permissions:{owner:false,views:['warehouse'],writes:['warehouse']}};
  if(p==='activity')result={lastActivityAt:new Date().toISOString()};
  if(p==='warehouse')result={rows,movements:[{id:'synthetic',branch:'imperatriz',destination:'Araguaína',created_at:'2026-10-08T10:00:00Z',items:[{serial:'8955000000000000003',kind:'chip',device_serial:'024000001',action:'Utilizado',detected_at:'2026-10-08T10:00:00Z',time_basis:'detection'}]}]};
  if(p.startsWith('warehouse/')&&req.method()==='PATCH'){const body=req.postDataJSON();writes.push(body);const row=rows.find(r=>r.id===p.split('/')[1]);assert.equal(body.version,row.version);row.classification=body.classification;row.version++;result={ok:true};}
  await route.fulfill({json:result});
 });
 await page.addInitScript(()=>localStorage.setItem('central-view:warehouse-ui',JSON.stringify({branch:'imperatriz',route:'warehouse'})));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('.warehouse-chart svg').waitFor();assert.equal(await page.locator('.warehouse-chart polyline').count(),4);
 assert.equal(await page.locator('.warehouse-metrics .value').nth(1).textContent(),'1');
 await page.waitForTimeout(800);await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/warehouse-overview.png',import.meta.url))});
 await page.locator('[data-warehouse-view="inventory"]').click();await page.locator('[data-tab="chip"]').click();
 await page.locator('#warehouse-classification').selectOption('Emergência');assert.equal(await page.locator('[data-warehouse-classify]').count(),1);
 await page.locator('#warehouse-status').selectOption('');assert.equal(await page.locator('[data-warehouse-classify]').count(),2);
 await page.locator('[data-warehouse-classify="'+rows[0].id+'"]').selectOption('Reserva');await page.waitForFunction(()=>document.querySelectorAll('[data-warehouse-classify]').length===1);
 assert.deepEqual(writes,[{classification:'Reserva',version:1}]);
 await page.locator('[data-warehouse-detail="'+rows[2].id+'"]').click();await page.locator('dialog[open]').waitFor();assert.ok((await page.locator('dialog[open]').innerText()).includes('024000001'));await page.locator('dialog[open]').evaluate(d=>d.close());
 await page.locator('[data-warehouse-view="movements"]').click();assert.ok((await page.locator('#warehouse-table').innerText()).includes('Araguaína'));
 await page.locator('#warehouse-base').selectOption('maraba');assert.ok((await page.locator('#warehouse-table').innerText()).includes('Nenhuma movimentação'));
 await page.locator('[data-warehouse-view="analysis"]').click();await page.locator('#warehouse-range').selectOption('3');assert.equal(await page.locator('#warehouse-month-totals th').count(),4);
 for(const viewport of [{width:1917,height:913},{width:1280,height:720},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(900);const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2).slice(0,16).map(e=>({tag:e.tagName,cls:e.className,id:e.id,w:e.getBoundingClientRect().width,text:e.textContent.slice(0,45)}))}));assert.ok(size.scroll<=size.width+2,JSON.stringify(size));}
 await page.setViewportSize({width:1917,height:913});await page.waitForTimeout(800);await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/warehouse-analysis.png',import.meta.url))});
 assert.deepEqual(errors,[]);console.log('PASS four tabs, classification, chip association history, destination filters, three-month four-line graph and responsive layout; synthetic API only.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
