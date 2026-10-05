import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1917,height:913}});
 const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8'),form=app.slice(app.indexOf('function newWarehouseItem()'),app.indexOf('\nfunction maintenance()',app.indexOf('function newWarehouseItem()')));
 await page.setContent('<style>'+await readFile(new URL('../public/styles.css',import.meta.url),'utf8')+'</style><dialog id="modal"></dialog>');
 await page.addScriptTag({content:(await readFile(new URL('../public/warehouse-register.js',import.meta.url),'utf8')).replace('export function','function')+`
 const modal=document.querySelector('#modal'),state={branch:'imperatriz'};
 const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const validIccid=s=>/^89\\d{17,18}$/.test(s),button=(text,id,cls)=>'<button type="button" id="'+id+'" class="'+cls+'">'+text+'</button>';
 function showModal(title,html){modal.innerHTML='<h2>'+title+'</h2>'+html;modal.showModal();}
 const notify=()=>{},render=()=>{},safe=async fn=>fn();
 window.saved=[];window.failLookup=false;
 const repo={real:true,currentBranch:'imperatriz',request:async path=>{const p=new URL('https://example.invalid/'+path).searchParams;return window.failLookup?{ok:false,message:'Consulta indisponível'}:{ok:true,iccid:p.get('iccid'),provider:p.get('provider'),operator:'VIVO',phone:'99999999999'};},addWarehouse:async(...args)=>window.saved.push(args)};
 `+form+';newWarehouseItem();'});
 await page.click('#kind-chip');await page.fill('#new-serial','8955000000000000001');
 assert.ok(await page.isDisabled('#save-item'));await page.selectOption('#chip-provider','link');await page.click('#lookup-chip');
 await page.waitForFunction(()=>!document.querySelector('#save-item').disabled);assert.match(await page.textContent('#chip-validation'),/VIVO.*Telefone: 99999999999/s);
 await page.fill('#new-serial','8955000000000000002');assert.ok(await page.isDisabled('#save-item'));
 await page.click('#lookup-chip');await page.waitForFunction(()=>!document.querySelector('#save-item').disabled);
 await page.selectOption('#chip-provider','arya');assert.ok(await page.isDisabled('#save-item'));
 await page.evaluate(()=>window.failLookup=true);await page.click('#lookup-chip');await page.waitForFunction(()=>document.querySelector('#chip-validation').textContent.includes('indisponível'));assert.ok(await page.isDisabled('#save-item'));
 await page.evaluate(()=>window.failLookup=false);await page.click('#lookup-chip');await page.waitForFunction(()=>!document.querySelector('#save-item').disabled);
 await page.click('#save-item');await page.waitForFunction(()=>window.saved.length===1);assert.deepEqual(await page.evaluate(()=>window.saved[0]),['chip','8955000000000000002','arya']);
 console.log('Warehouse UI passed: provider selection, exact search, operator display, invalidation, failure, save. No real API or records.');
}finally{await browser.close();}
