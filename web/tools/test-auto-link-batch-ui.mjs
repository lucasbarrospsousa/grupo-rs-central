import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',p.endsWith('.css')?'text/css':/\.m?js$/.test(p)?'text/javascript':p.endsWith('.png')?'image/png':'text/html');res.end(p==='/mode.js'?"export default 'production'":await readFile(new URL('../public'+(p==='/'?'/index.html':p),import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1917,height:913}}),errors=[],posts=[];let operations=[],loads=0;
 const devices=Array.from({length:5},(_,i)=>({id:'synthetic-'+i,serial:'02499999'+i,branch:'imperatriz',status:['Estoque','Reserva','Manutenção','Estoque','Instalado'][i],model:'V7.2.2',identification:'AAA - TESTE',version:1}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.slice(5);let result={rows:[],visits:[],movements:[],results:[]};
  if(p==='session')result={username:'batch-ui',csrf:'synthetic-session',lastActivityAt:new Date().toISOString(),branches:[{id:'imperatriz',name:'Imperatriz'}],permissions:{owner:false,views:['stock'],writes:['stock']}};
  if(p==='activity')result={lastActivityAt:new Date().toISOString()};
  if(p==='devices'){loads++;result={rows:devices};}
  if(p==='integrations/auto-link'){
   if(req.method()==='POST'){
    const body=req.postDataJSON();posts.push(body);
    if(body.cancel){operations=operations.map(r=>r.running?r:{...r,state:'cancelled',result:{message:'Cancelado antes do envio'}});result={message:'3 canceladas; 1 aguardando resultado.'};}
    else{operations=body.items.slice(0,4).map((r,i)=>({id:'op-'+i,serial:devices[i].serial,state:'submitted',running:i===0,result:{}}));result={message:'4 de 5 aceitos',results:body.items.map((r,i)=>i===4?{device_id:r.id,ok:false,message:'Aparelho instalado'}:{device_id:r.id,id:'op-'+i,ok:true})};}
   }else result={rows:operations};
  }
  await route.fulfill({json:result});
 });
 await page.addInitScript(()=>localStorage.setItem('central-view:batch-ui',JSON.stringify({branch:'imperatriz',route:'stock'})));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.getByText('024999990',{exact:true}).first().waitFor();
 await page.locator('#stock-all').check();await page.locator('#stock-link-selected').click();await page.getByText('Aparelho instalado',{exact:false}).waitFor();await page.locator('#modal .close').click();
 assert.equal(posts.length,1);assert.equal(posts[0].items.length,5);
 await page.waitForFunction(()=>document.querySelector('#stock-link-progress').textContent.includes('3 na fila'));
 assert.equal(await page.locator('[data-auto-link]').filter({hasText:'Vinculando'}).count(),1);
 await page.screenshot({path:fileURLToPath(new URL('../../artifacts/auto-link-batch-ui.png',import.meta.url))});
 await page.locator('#stock-link-cancel').click();await page.waitForFunction(()=>document.querySelector('#stock-link-progress').textContent.includes('3 cancelados'));
 assert.equal(posts.length,2);assert.deepEqual(posts[1],{cancel:true});
 const before=loads;operations=operations.map(r=>r.running?{...r,state:'confirmed',result:{message:'Vínculo confirmado'}}:r);
 await page.waitForFunction(()=>document.querySelector('#stock-link-progress').textContent.includes('1 vinculados'),{},{timeout:12000});
 await page.waitForTimeout(500);assert.ok(loads>before);assert.deepEqual(errors,[]);
 console.log('PASS real stock UI: checked selection, one batch POST, partial rejection, AJAX states, cancellation POST, final list refresh; simulated API.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
