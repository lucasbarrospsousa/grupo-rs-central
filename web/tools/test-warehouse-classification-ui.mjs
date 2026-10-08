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
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.slice(5);let result={rows:[],visits:[],movements:[]};
  if(p==='session')result={username:'warehouse-ui',csrf:'synthetic',lastActivityAt:new Date().toISOString(),branches:[{id:'imperatriz',name:'Imperatriz',role:'admin'}],permissions:{owner:false,views:['warehouse'],writes:['warehouse']}};
  if(p==='activity')result={lastActivityAt:new Date().toISOString()};
  if(p==='warehouse')result={rows,movements:[]};
  if(p.startsWith('warehouse/')&&req.method()==='PATCH'){const body=req.postDataJSON();writes.push(body);const row=rows.find(r=>r.id===p.split('/')[1]);assert.equal(body.version,row.version);row.classification=body.classification;row.version++;result={ok:true};}
  await route.fulfill({json:result});
 });
 await page.addInitScript(()=>localStorage.setItem('central-view:warehouse-ui',JSON.stringify({branch:'imperatriz',route:'warehouse'})));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-tab="chip"]').click();await page.getByText(rows[0].serial,{exact:true}).waitFor();
 await page.locator('#warehouse-classification').selectOption('Emergência');assert.equal(await page.locator('[data-warehouse-classify]').count(),1);
 await page.locator('#warehouse-status').selectOption('');assert.equal(await page.locator('[data-warehouse-classify]').count(),2);
 await page.locator('[data-warehouse-classify="'+rows[0].id+'"]').selectOption('Reserva');await page.waitForFunction(()=>document.querySelectorAll('[data-warehouse-classify]').length===1);
 assert.deepEqual(writes,[{classification:'Reserva',version:1}]);assert.equal(rows[0].status,'Disponível');assert.equal(rows[2].status,'Utilizado');
 await page.locator('#warehouse-classification').selectOption('');assert.equal(await page.locator('[data-warehouse-classify]').count(),3);
 await page.screenshot({path:fileURLToPath(new URL('../../artifacts/warehouse-classification-ui.png',import.meta.url))});
 await page.locator('#warehouse-new').click();assert.equal(await page.locator('#new-classification').inputValue(),'Estoque');await page.locator('#new-classification').selectOption('Reserva');assert.deepEqual(errors,[]);
 console.log('PASS warehouse UI: classification filter, usage filter, AJAX edit, saved version, original usage and new-item selector; synthetic API.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
