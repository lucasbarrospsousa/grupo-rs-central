import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const moduleText=await readFile(new URL('../public/usage-control.mjs',import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',r=>r.fulfill({contentType:r.request().url().endsWith('.mjs')?'text/javascript':'text/html',body:r.request().url().endsWith('.mjs')?moduleText:'<html><body><button id="manual">Atualizar manualmente</button></body></html>'}));
 await page.goto('https://budget.test/');await page.clock.install();
 await page.evaluate(async()=>{const m=await import('/control.mjs');window.module=m;m.mountUsageControl();window.calls=0;window.fail=false;window.stop=m.startEconomyPolling(async()=>{window.calls++;return !window.fail;},{interval:120000,cost:3});window.manual=0;document.querySelector('#manual').onclick=()=>window.manual++;});
 // clock-paused zero timers cannot settle themselves: only run the clock below.
 await page.clock.runFor(120000);await page.waitForFunction(()=>window.calls===1);
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));await page.clock.runFor(600000);assert.equal(await page.evaluate(()=>window.calls),1);
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:false}));await page.clock.runFor(10000);await page.waitForFunction(()=>window.calls===2);
 await page.locator('#usage-control summary').click();await page.locator('[data-usage-pause]').click();await page.clock.runFor(300000);assert.equal(await page.evaluate(()=>window.calls),2);
 await page.locator('#manual').click();assert.equal(await page.evaluate(()=>window.manual),1);
 await page.locator('[data-usage-pause]').click();await page.evaluate(()=>{window.fail=true;});await page.clock.runFor(60000);await page.waitForFunction(()=>window.calls===3);
 await page.clock.runFor(120000);assert.equal(await page.evaluate(()=>window.calls),3);
 await page.clock.runFor(120000);await page.waitForFunction(()=>window.calls===4);
 await page.evaluate(()=>{window.stop();localStorage.setItem('sinderacode:auto-reads:v1',JSON.stringify({events:[{at:Date.now(),cost:120}],paused:false}));window.stop=window.module.startEconomyPolling(async()=>window.calls++,{interval:10000});});await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>window.calls),4);
 await page.locator('#manual').click();assert.equal(await page.evaluate(()=>window.manual),2);
 await page.evaluate(()=>window.stop());await page.clock.runFor(3600000);assert.equal(await page.evaluate(()=>window.calls),4);assert.deepEqual(errors,[]);
 console.log('PASS browser: hidden, pause/resume, manual bypass, backoff, exhausted budget, cleanup, no JS errors.');
}finally{await browser.close();}
