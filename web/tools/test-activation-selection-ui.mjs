import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('../public'+new URL(req.url,'http://localhost').pathname,import.meta.url)));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,channel:'chrome'});
try{const page=await browser.newPage(),errors=[],outside=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(outside.push(r.request().url()),r.abort()));
await page.goto(origin+'/warehouse-activation.js');await page.setContent('<main id="test"></main>');
await page.evaluate(async origin=>{
 const {mountWarehouseActivation}=await import(origin+'/warehouse-activation.js');
 const warehouse=Array.from({length:51},(_,i)=>({id:'qa-'+i,serial:'895500000000000'+String(i).padStart(4,'0'),kind:'chip',status:'Disponível',classification:'Reserva',chip_provider:'arya'}));
 window.sent=[];window.prepared=[];window.qaMode='ok';
 const repo={real:true,user:{branches:[{id:'imperatriz',role:'admin'}],permissions:{owner:true}},warehouse,request:async(path,{body})=>{
 if(window.qaMode==='error')throw Error('Falha fictícia antes do envio');
 if(body.action==='prepare'){const ids=[...body.ids],iccids=[...body.iccids];window.prepared.push({ids,iccids});if(window.qaMode==='mismatch')return {ok:true,id:'qa-batch',state:'prepared',count:1,iccids:['8955000000000099999']};warehouse.filter(r=>ids.includes(r.id)).forEach(r=>r.activation_state='prepared');return {ok:true,id:'qa-batch',state:'prepared',count:iccids.length,iccids};}
 window.sent.push([...body.iccids]);warehouse.filter(r=>body.iccids.includes(r.serial)).forEach(r=>r.activation_state='requested');return {ok:true,message:'Lote fictício concluído'};
 }};
 window.panel=mountWarehouseActivation(document.querySelector('#test'),{repo,icon:()=>''});window.panel.update(warehouse);
},origin);
await page.locator('#reserve-size').selectOption('20');
for(let lot=0;lot<6;lot++){
 if(lot===2||lot===4)await page.locator('#reserve-next').click();
 const n=lot===5?1:10,ids=[];
 for(let i=0;i<n;i++){const checkbox=page.locator('[data-reserve-id]:not(:disabled):not(:checked)').first();const id=await checkbox.getAttribute('data-reserve-id');ids.push(id);await page.locator('[data-reserve-id="'+id+'"]').check();}
 await page.locator('#reserve-request').click();await page.waitForFunction(n=>window.sent.length===n,lot+1);
 assert.deepEqual(await page.evaluate(()=>window.prepared.at(-1).ids),ids);assert.match(dialogs.at(-1),new RegExp('exatamente '+n+' chips'));assert.equal(await page.locator('[data-reserve-id]:checked').count(),0);
}
const sent=await page.evaluate(()=>window.sent.flat());assert.equal(sent.length,51);assert.equal(new Set(sent).size,51);
// Re-mount a fresh fixture to verify failures and page/filter changes without real requests.
await page.evaluate(()=>{location.hash='tests-complete';});assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);console.log(JSON.stringify({pass:true,manualLots:[10,10,10,10,10,1],limit:20,total:sent.length,unique:new Set(sent).size,reviewDialogs:dialogs.length,externalRequests:0}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
