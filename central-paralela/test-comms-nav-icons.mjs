import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const contentTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relative=pathname==='/'?'/index.html':pathname;
  if(relative.includes('..')){res.writeHead(400).end();return;}
  try{
    const body=await readFile(new URL('./public'+relative,import.meta.url));
    const extension=relative.slice(relative.lastIndexOf('.'));
    res.setHeader('Content-Type',contentTypes[extension]||'application/octet-stream');
    res.end(body);
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:390,height:900},deviceScaleFactor:2});
  await page.route('**/*.js',route=>route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>{
    document.querySelector('#startup-loading')?.remove();
    document.querySelector('#dashboard').hidden=false;
    document.querySelector('#nav-sms').hidden=false;
  });
  const cases=[
    {id:'#nav-whatsapp',color:'rgb(37, 211, 102)',border:'rgb(37, 211, 102)',src:'/assets/nav-whatsapp-app.webp'},
    {id:'#nav-sms',color:'rgb(66, 133, 244)',border:'rgb(66, 133, 244)',src:'/assets/nav-sms-app.webp'}
  ];
  for(const item of cases){
    const button=page.locator(item.id),label=button.locator('.nav-label'),icon=button.locator('.nav-app-icon');
    const base=await button.evaluate(e=>({label:getComputedStyle(e.querySelector('.nav-label')).color,rect:e.getBoundingClientRect().toJSON()}));
    assert.equal(base.label,item.color,`${item.id} default text color`);
    const image=await icon.evaluate(e=>({src:new URL(e.src).pathname,width:e.naturalWidth,height:e.naturalHeight,shown:e.getBoundingClientRect().toJSON()}));
    assert.equal(image.src,item.src,`${item.id} app artwork`);
    assert.equal(image.width,512,`${item.id} source width`);
    assert.equal(image.height,512,`${item.id} source height`);
    assert.equal(image.shown.width,22,`${item.id} rendered icon width`);
    assert.ok(Math.abs(image.shown.y+image.shown.height/2-(base.rect.y+base.rect.height/2))<1,`${item.id} icon alignment`);
    await button.hover();
    await page.waitForTimeout(220);
    const hover=await button.evaluate(e=>({label:getComputedStyle(e.querySelector('.nav-label')).color,border:getComputedStyle(e).borderTopColor,background:getComputedStyle(e).backgroundColor}));
    assert.equal(hover.label,'rgb(255, 255, 255)',`${item.id} hover text`);
    assert.equal(hover.border,item.border,`${item.id} hover border`);
    assert.notEqual(hover.background,'rgba(0, 0, 0, 0)',`${item.id} hover fill`);
    await button.evaluate(e=>e.setAttribute('aria-current','page'));
    const selected=await button.evaluate(e=>({label:getComputedStyle(e.querySelector('.nav-label')).color,border:getComputedStyle(e).borderTopColor}));
    assert.equal(selected.label,'rgb(255, 255, 255)',`${item.id} selected text`);
    assert.equal(selected.border,item.border,`${item.id} selected border`);
    await button.evaluate(e=>e.removeAttribute('aria-current'));
  }
  if(process.env.COMMS_NAV_SCREENSHOT)await page.locator('.sidebar').screenshot({path:process.env.COMMS_NAV_SCREENSHOT,animations:'disabled'});
  console.log('PASS communication tab icons: official 512px app assets, 22px alignment, brand colors, hover and selected states.');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
