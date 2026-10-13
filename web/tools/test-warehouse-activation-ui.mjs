import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',p.endsWith('.css')?'text/css':(/\.m?js$/).test(p)?'text/javascript':p.endsWith('.png')?'image/png':'text/html');res.end(p==='/mode.js'?"export default 'production'":await readFile(new URL('../public'+(p==='/'?'/index.html':p),import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1917,height:913}}),errors=[],writes=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});page.setDefaultTimeout(10000);
 const rows=Array.from({length:25},(_,i)=>({id:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,branch:'imperatriz',kind:'chip',serial:'8955000000000000'+String(i).padStart(3,'0'),status:'Disponível',classification:'Reserva',chip_provider:'arya',chip_operator:'ALGAR 5 OP',chip_phone:'',received_at:'2026-10-13T10:00:00Z',version:1}));
 const lot='22222222-2222-4222-8222-222222222222';rows[24].activation_batch=lot;rows[24].activation_state='requested';rows[24].activation_at='2026-10-13T10:00:00Z';
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.hostname!=='127.0.0.1')throw Error('External request blocked: '+u.hostname);
  if(!u.pathname.startsWith('/api/'))return route.continue();
  const p=u.pathname.slice(5);let result={rows:[],visits:[],movements:[]};
  if(p==='session')result={username:'warehouse-test',csrf:'test',lastActivityAt:new Date().toISOString(),branches:[{id:'imperatriz',name:'Imperatriz',role:'admin'}],permissions:{owner:false,views:['warehouse'],writes:['warehouse']}};
  if(p==='warehouse')result={rows,movements:[]};
  if(p==='warehouse-activation'){
   const b=req.postDataJSON();writes.push(b);
   if(b.action==='prepare'){assert.ok([10,20].includes(b.size));assert.ok(b.ids.length<=b.size);const chosen=rows.filter(r=>b.ids.includes(r.id));assert.ok(chosen.every(r=>!r.activation_state));for(const r of chosen){r.activation_batch='33333333-3333-4333-8333-333333333333';r.activation_state='prepared';r.activation_at=new Date().toISOString();}result={ok:true};}
   if(b.action==='requested'){for(const r of rows.filter(r=>r.activation_batch===b.batch))r.activation_state='requested';result={ok:true};}
   if(b.action==='check')result={ok:true,confirmed:0,pending:10,errors:0};
  }
  await route.fulfill({json:result});
 });
 await page.addInitScript(()=>localStorage.setItem('central-view:warehouse-test',JSON.stringify({branch:'imperatriz',route:'warehouse'})));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-warehouse-view="reserve"]').waitFor().catch(async e=>{console.log((await page.locator('body').innerText()).slice(0,1800));throw e;});await page.locator('[data-warehouse-view="reserve"]').click();
 await page.locator('#reserve-select').click();assert.equal(await page.locator('[data-reserve-id]:checked').count(),10);assert.ok(await page.locator('#reserve-prepare').isDisabled());
 await page.locator('#reserve-size').selectOption('20');await page.locator('#reserve-select').click();assert.equal(await page.locator('[data-reserve-id]:checked').count(),20);
 await page.locator('#reserve-size').selectOption('10');await page.locator('#reserve-select').click();await page.locator('#reserve-checked').check();await page.locator('#reserve-prepare').click();
 await page.getByText('Lote reservado na Central. Ainda não enviado à Árya.').waitFor();assert.equal(writes.length,1);
 assert.equal(await page.locator('[data-reserve-id]:disabled').count(),10);
 await page.reload();await page.locator('[data-warehouse-view="reserve"]').click();assert.equal(await page.locator('[data-reserve-id]:disabled').count(),10);
 const batch='33333333-3333-4333-8333-333333333333';const article=page.locator('article').filter({has:page.locator(`[data-requested="${batch}"]`)});await article.locator('summary').click();
 await page.locator(`[data-requested="${batch}"]`).click();assert.equal(writes.length,1);
 await page.locator(`[data-reference="${batch}"]`).fill('PROTOCOLO-SIMULADO');await page.locator(`[data-confirm-batch="${batch}"]`).check();await page.locator(`[data-requested="${batch}"]`).click();await page.getByText('Solicitação registrada. Aguarde a ativação pela operadora.').waitFor();assert.equal(writes.length,2);
 await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/warehouse-reserve.png',import.meta.url)),fullPage:true});
 for(const width of [1280,390]){await page.setViewportSize({width,height:844});await page.waitForTimeout(900);const measured=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&e.getBoundingClientRect().width>0).slice(-15).map(e=>({tag:e.tagName,cls:e.className,id:e.id,w:e.getBoundingClientRect().width}))}));assert.ok(measured.scroll<=measured.w+2,JSON.stringify(measured));}
 assert.deepEqual(errors,[]);console.log('PASS UI 10/20, persisted reservation, no duplicate selection, explicit portal confirmation, responsive layout. All API calls mocked; zero external requests.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
