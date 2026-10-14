import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',p.endsWith('.css')?'text/css':/\.m?js$/.test(p)?'text/javascript':p.endsWith('.png')?'image/png':'text/html');res.end(p==='/mode.js'?"export default 'production'":await readFile(new URL('../public'+(p==='/'?'/index.html':p),import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1917,height:913}}),errors=[],writes=[],external=[];let costCalls=0,reads=0,readOnly=false;
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 const rows=Array.from({length:30},(_,i)=>({id:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,branch:'imperatriz',kind:'chip',serial:'8955000000000000'+String(i).padStart(3,'0'),status:'Disponível',classification:i<26?'Reserva':i<28?'Estoque':'Emergência',chip_provider:i===29?'link':'arya',chip_operator:i===29?'Vivo':'ALGAR',chip_phone:i<26?'':'5599990001000',received_at:'2026-10-13T10:00:00Z',version:1}));
 for(const [i,state] of ['requested','uncertain','sending','prepared'].entries())rows[22+i].activation_state=state;
 rows[26].activation_state='active';rows[27].status='Utilizado';
 const lot='22222222-2222-4222-8222-222222222222';
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.hostname!=='127.0.0.1'){external.push(url.hostname);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const p=url.pathname.slice(5);let result={rows:[],visits:[],movements:[]};
  if(p==='session')result={username:'chip-inventory-test',csrf:'synthetic',lastActivityAt:new Date().toISOString(),branches:[{id:'imperatriz',name:'Imperatriz',role:readOnly?'viewer':'admin'}],permissions:{owner:!readOnly,views:['warehouse'],writes:readOnly?[]:['warehouse']}};
  if(p==='activity')result={lastActivityAt:new Date().toISOString()};
  if(p==='warehouse'){reads++;result={rows,movements:[]};}
  if(p==='warehouse-pending'){result={ok:true,count:1,preserved:0,changes:{branch:'imperatriz',warehouse:[{...rows[0],id:'33333333-3333-4333-8333-333333333333',serial:'8955000000000000999',activation_state:null,activation_batch:null}]}};}
  if(p==='warehouse-costs'){costCalls++;result={ok:true,providers:[{provider:'arya',name:'Árya',checked_at:new Date().toISOString(),confirmed:1,total_cents:399},{provider:'link',name:'Link Solutions',checked_at:'2026-01-01T12:00:00Z',confirmed:0,total_cents:0}],checked_at:new Date().toISOString(),complete:false,total_cents:399,confirmed:1,chip_count:30,device_count:30,missing:0,not_found:29,inactive:0,without_price:0,duplicates:0,groups:[],items:[{iccid:rows[26].serial,devices:['024999999'],provider:'arya',operator:'ALGAR',apn:'hinova.br',associations:[{serial:'024999999',plate:'ABC1D23',apn:'hinova.br'}],state:'Confirmado',cents:399}]};}
  if(p==='warehouse-activation'||p==='warehouse-activation-send'){
   const body=req.postDataJSON();writes.push(body);assert.ok(!readOnly);
   if(body.action==='prepare'){assert.ok(body.ids.length<=body.size);assert.ok([10,20].includes(body.size));const chosen=rows.filter(r=>body.ids.includes(r.id));assert.ok(chosen.every(r=>!r.activation_state&&r.classification==='Reserva'));for(const r of chosen){r.activation_state='prepared';r.activation_batch=lot;}result={ok:true,id:lot,state:'prepared',changes:{branch:'imperatriz',warehouse:chosen}};}
   else if(body.action==='send'){const chosen=rows.filter(r=>r.activation_batch===body.batch);for(const r of chosen)r.activation_state='requested';result={ok:true,state:'requested',message:'Solicitação simulada concluída.',changes:{branch:'imperatriz',warehouse:chosen}};}
   else assert.fail('Unexpected activation action');
  }
  if(p.startsWith('warehouse/')&&req.method()==='PATCH'){const body=req.postDataJSON();writes.push(body);const row=rows.find(r=>r.id===p.split('/')[1]);row.classification=body.classification;row.version++;result={ok:true,changes:{branch:'imperatriz',warehouse:[row]}};}
  await route.fulfill({json:result});
 });
 await page.addInitScript(()=>localStorage.setItem('central-view:chip-inventory-test',JSON.stringify({branch:'imperatriz',route:'warehouse'})));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#wo-cost-summary')?.textContent.includes('3,99'));
 await page.locator('[data-wo-action="chips"]').first().click();await page.locator('#ci-search').waitFor();
 assert.equal(await page.locator('.warehouse-heading h1').first().innerText(),'Gestão de chips');
 assert.match(await page.locator('[data-ci-category="Estoque"]').innerText(),/Chips disponíveis para uso/);
 assert.equal(await page.locator('.warehouse-transfer').isVisible(),false);assert.equal(await page.locator('.warehouse-metrics').isVisible(),false);
 const initialReads=reads;
 await page.locator('#ci-search').fill(rows[26].serial);assert.equal(await page.locator('[data-ci-id]').count(),1);assert.match(await page.locator('.wc-price').innerText(),/3,99/);
 await page.locator('#ci-search').fill('none');assert.match(await page.locator('.wc-table-wrap').innerText(),/Nenhum chip/);
 await page.locator('#ci-search').fill('');await page.locator('#ci-provider').selectOption('link');assert.equal(await page.locator('[data-ci-id]').count(),1);assert.ok(await page.locator('[data-ci-id]').isDisabled());
 await page.locator('#ci-provider').selectOption('');await page.locator('[data-ci-category="Estoque"]').click();assert.equal(await page.locator('[data-ci-id]').count(),1);await page.locator('#ci-status').selectOption('');assert.equal(await page.locator('[data-ci-id]').count(),2);
 await page.locator('#ci-status').selectOption('Disponível');await page.locator('[data-ci-category="Reserva"]').click();
 // Pending, prepared, sending and uncertain rows are all disabled; inspecting them cannot send.
 for(const i of [22,23,24,25]){await page.locator('#ci-search').fill(rows[i].serial);assert.ok(await page.locator('[data-ci-id]').isDisabled());assert.ok(await page.locator('#ci-request').isDisabled());}
 await page.locator('#ci-search').fill('');assert.equal(writes.length,0);assert.equal(reads,initialReads);assert.equal(costCalls,1);
 // Selection spans pages but cannot exceed the chosen 10/20 cap.
 await page.locator('#ci-select-page').click();await page.locator('#ci-next').click();await page.locator('#ci-select-page').click();assert.match(await page.locator('.wc-selection strong').innerText(),/^10 chips/);
 await page.locator('#ci-size').selectOption('20');await page.locator('#ci-prev').click();await page.locator('#ci-select-page').click();await page.locator('#ci-next').click();await page.locator('#ci-select-page').click();await page.locator('#ci-next').click();await page.locator('#ci-select-page').click();assert.match(await page.locator('.wc-selection strong').innerText(),/^20 chips/);
 await page.locator('#ci-clear').click();await page.locator('#ci-size').selectOption('10');await page.locator('[data-ci-category=""]').click();
 await page.locator('[data-ci-id]').first().check();await page.locator('[data-ci-id]').nth(1).check();
 await page.waitForTimeout(500);await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/chips-inventory-desktop.png',import.meta.url)),fullPage:true});
 await page.locator('#ci-request').dblclick();await page.getByText('Solicitação simulada concluída.').waitFor();assert.deepEqual(writes.map(w=>w.action),['prepare','send']);assert.equal(writes[0].ids.length,2);assert.ok(await page.locator('[data-ci-id]').first().isDisabled());
 await page.locator('#ci-history').click();assert.ok(await page.locator('#chips-reserve-request').isVisible());assert.equal(await page.locator('#activation-check-all').count(),0);assert.equal(await page.locator('#chips-activation-check-all').count(),1);await page.locator('[data-warehouse-view="chips"]').click();
 await page.locator('#warehouse-new').click();assert.ok(await page.locator('#chip-provider').isVisible());await page.locator('dialog').evaluate(d=>d.close());
 await page.locator('#ci-search').fill(rows[28].serial);await page.locator('.wc-row-actions summary').click();await page.locator('[data-ci-classify]').selectOption('Estoque');await page.waitForFunction(()=>document.querySelector('.wc-tag')?.textContent.includes('Estoque'));
 await page.locator('.wc-row-actions [data-ci-detail]').click();assert.match(await page.locator('dialog[open]').innerText(),new RegExp(rows[28].serial));await page.locator('dialog').evaluate(d=>d.close());
 await page.locator('[data-ci-section="billing"]').click();assert.ok(await page.locator('.wc-billing').isVisible());
 await page.locator('#cb-search').fill('ABC1D23');assert.match(await page.locator('.wc-billing-table').innerText(),/024999999/);assert.match(await page.locator('.wc-billing-table').innerText(),/hinova.br/);assert.match(await page.locator('.wc-tariffs').innerText(),/3,99/);
 await page.locator('[data-cb-group]').click();assert.equal(await page.locator('.wc-billing-table tbody tr').count(),1);await page.locator('#cb-clear').click();assert.equal(costCalls,1);
 for(const viewport of [{width:1917,height:913},{width:1280,height:720},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(400);const x=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth,over:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().right>innerWidth+2&&!e.closest('.wc-billing-table')).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,70),parent:e.parentElement.className,x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width}))}));assert.ok(x.s<=x.w+2,JSON.stringify(x));}
 await page.setViewportSize({width:1917,height:913});await page.waitForTimeout(500);await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/chips-billing-desktop.png',import.meta.url)),fullPage:true});
 await page.locator('[data-warehouse-view="overview"]').click();
 await page.locator('[data-wo-chip="Reserva"]').click();assert.equal(await page.locator('#ci-category').inputValue(),'Reserva');
 for(const viewport of [{width:1917,height:913},{width:1280,height:720},{width:390,height:844}]){await page.setViewportSize(viewport);await page.waitForTimeout(350);const measured=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(measured.scroll<=measured.width+2,JSON.stringify(measured));}
 await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/chips-inventory-mobile.png',import.meta.url)),fullPage:true});
 await page.setViewportSize({width:1917,height:913});
 const beforePendingReads=reads,beforePendingWrites=writes.length;
 const top=await page.locator('#warehouse-new').boundingBox(),bottom=await page.locator('#warehouse-pending').boundingBox();assert.ok(bottom.y>=top.y+top.height);
 await page.locator('#warehouse-pending').click();await page.getByRole('status').filter({hasText:'1 incluídos em reserva'}).waitFor();
 await page.locator('#ci-search').fill('8955000000000000999');assert.equal(await page.locator('[data-ci-id]').count(),1);assert.equal(reads,beforePendingReads);assert.equal(writes.length,beforePendingWrites);
 await page.screenshot({path:fileURLToPath(new URL('../.sites-runtime/chips-pending-desktop.png',import.meta.url)),fullPage:true});
 await page.setViewportSize({width:1917,height:913});readOnly=true;await page.reload();await page.locator('[data-warehouse-view="chips"]').click();assert.ok(await page.locator('#ci-request').isDisabled());assert.equal(await page.locator('[data-ci-id]:enabled').count(),0);assert.equal(await page.locator('[data-ci-section="billing"]').count(),0);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.equal(costCalls,1);
 console.log('PASS chips inventory: local filters, pagination, cached prices, 10/20 limits, pending guards, double click, registration, classification, history, overview, permissions and 3 viewports. Synthetic API only; zero external requests.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
