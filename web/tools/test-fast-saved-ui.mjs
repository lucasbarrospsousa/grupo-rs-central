import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const fixture=spawn(process.execPath,['tools/startup-fixture.mjs'],{stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{fixture.stdout.once('data',resolve);fixture.once('error',reject);fixture.once('exit',code=>reject(Error('Fixture exit '+code)));});
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:1917,height:917}});const errors=[],calls=[],outside=[];let release,slowDone=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:4189'){outside.push(u.origin);return route.abort();}if(u.pathname.startsWith('/api/'))calls.push(u.pathname+u.search);
 if(u.pathname==='/api/warehouse'&&u.searchParams.get('view')==='overview'&&!release){await new Promise(r=>release=r);slowDone=true;}
 return route.continue();});
 await page.goto('http://127.0.0.1:4189');await page.locator('#login-username').fill('fixture');await page.locator('#login-password').fill('synthetic');await page.locator('#real-login [type=submit]').click();await page.locator('#sql-open-stock').waitFor();
 const t=Date.now();await page.locator('#sql-open-stock').click();await page.getByText('24000000',{exact:true}).first().waitFor();const stockMs=Date.now()-t;
 assert.equal(slowDone,false);assert.ok(!calls.some(x=>x.includes('startup-bundle')));release();
 await page.locator('[data-nav="overview"]').click();await page.locator('#sql-open-stock').waitFor();const back=Date.now();await page.locator('#sql-open-stock').click();await page.getByText('24000000',{exact:true}).first().waitFor();const reopenMs=Date.now()-back;
 await mkdir('.sites-runtime',{recursive:true});await page.screenshot({path:'.sites-runtime/fast-saved-stock.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);console.log(JSON.stringify({stockMs,reopenMs,blockedExternalRequests:outside.length,errors,slowPanelDidNotBlock:true}));
}finally{await browser?.close();fixture.kill();}
