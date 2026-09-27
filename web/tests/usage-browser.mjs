import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const moduleText=await readFile(new URL('../public/usage-control.mjs',import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>{const url=r.request().url();return r.fulfill({contentType:url.includes('/api/economy')?'application/json':url.endsWith('.mjs')?'text/javascript':'text/html',body:url.includes('/api/economy')?JSON.stringify({mode:'economy',factor:2,hour:90,day:700,validUntil:Date.now()+1800000}):url.endsWith('.mjs')?moduleText:'<html><body><button id="manual">Atualizar manualmente</button></body></html>'});});
 await page.goto('https://grupo-rs-central.lucasbarrosp.chatgpt.site');await page.evaluate(async()=>{window.module=await import('/control.mjs');window.module.mountUsageControl();});await page.waitForTimeout(150);await page.clock.install();
 await page.evaluate(()=>{window.calls=0;window.manual=0;window.stop=window.module.startEconomyPolling(async()=>++window.calls,{interval:10000,cost:45});document.querySelector('#manual').onclick=()=>window.manual++;});
 await page.clock.runFor(10000);assert.equal(await page.evaluate(()=>window.calls),0);await page.clock.runFor(10000);await page.waitForFunction(()=>window.calls===1);
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));await page.clock.runFor(100000);assert.equal(await page.evaluate(()=>window.calls),1);
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:false}));await page.clock.runFor(10000);await page.waitForFunction(()=>window.calls===2);await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>window.calls),2);
 assert.equal(await page.locator('#usage-control').count(),0);await page.locator('#manual').click();assert.equal(await page.evaluate(()=>window.manual),1);await page.evaluate(()=>window.stop());await page.clock.runFor(100000);assert.equal(await page.evaluate(()=>window.calls),2);assert.deepEqual(errors,[]);console.log('PASS: central policy, factor, budget, hidden tab, manual action, no internal widget, cleanup');
}finally{await browser.close();}
