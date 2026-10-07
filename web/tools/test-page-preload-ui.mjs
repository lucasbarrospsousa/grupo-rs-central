import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',p.endsWith('.css')?'text/css':/\.m?js$/.test(p)?'text/javascript':p.endsWith('.png')?'image/png':'text/html');res.end(p==='/mode.js'?"export default 'production'":await readFile(new URL('../public'+(p==='/'?'/index.html':p),import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1917,height:913}}),calls=[],errors=[];let delayed=false,fresh=false,release;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname.slice(5),q=new URL(route.request().url()).searchParams;calls.push(p+'?'+q);
  let result={rows:[],visits:[],movements:[],results:[]};
  if(p==='session')result={username:'ui-test',csrf:'synthetic-session',lastActivityAt:new Date().toISOString(),branches:[{id:'imperatriz',name:'Imperatriz'},{id:'araguaina',name:'Araguaína'}],permissions:{owner:false,views:['stock','warehouse','maintenance'],writes:['stock','warehouse','maintenance']}};
  if(p==='activity')result={lastActivityAt:new Date().toISOString()};
  if(p==='devices'){if(delayed)await new Promise(r=>release=r);result={rows:[{id:'synthetic',branch:q.get('branch'),serial:fresh?'024999998':'024999999',status:'Estoque',identification:'XRS - TESTE',plate:'',carrier:'Vivo',version:1}]};}
  await route.fulfill({json:result});
 });
 await page.addInitScript(()=>{if(!localStorage.getItem('central-view:ui-test'))localStorage.setItem('central-view:ui-test',JSON.stringify({branch:'imperatriz',route:'stock'}));});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.getByText('024999999',{exact:true}).first().waitFor();
 await page.waitForFunction(()=>Object.keys(JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.startsWith('central-page-cache-v1:')))||'{}')).length===3);
 for(const route of ['warehouse','maintenance','stock']){await page.locator('[data-nav="'+route+'"]').click();await page.waitForFunction(r=>document.body.dataset.route===r,route);}
 assert.equal(calls.filter(p=>p==='devices?branch=imperatriz').length,1);assert.equal(calls.filter(p=>p==='warehouse?branch=imperatriz').length,1);assert.equal(calls.filter(p=>p==='history?branch=imperatriz').length,1);
 delayed=true;await page.reload();await page.getByText('024999999',{exact:true}).first().waitFor();assert.match(await page.locator('.release-strip').innerText(),/Cópia temporária/);
 // A background refresh must not replace an open edit dialog.
 await page.locator('#stock-new').click();await page.locator('#modal[open]').waitFor();const field=page.locator('#modal input').first();await field.fill('rascunho');
 while(!release)await new Promise(r=>setTimeout(r,10));fresh=true;delayed=false;release();await page.waitForTimeout(350);assert.equal(await field.inputValue(),'rascunho');
 await page.locator('#modal .close').click();await page.getByText('024999998',{exact:true}).first().waitFor();assert.doesNotMatch(await page.locator('.release-strip').innerText(),/Cópia temporária/);
 await page.locator('#branch').selectOption('araguaina');await page.getByText('024999998',{exact:true}).first().waitFor();await page.waitForTimeout(900);
 assert.equal(calls.some(p=>p==='warehouse?branch=araguaina'),false);assert.equal(calls.filter(p=>p==='devices?branch=araguaina').length,1);assert.deepEqual(errors,[]);
 console.log('PASS: real app navigation reuses SQL, reload shows snapshot before network, AJAX preserves open draft, selected branch respects hidden warehouse. Synthetic API only.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
