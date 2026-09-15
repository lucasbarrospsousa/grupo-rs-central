const {chromium}=require('playwright');
const {pathToFileURL}=require('url');
const path=require('path');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.join(__dirname,'login.html')).href);
  await page.locator('#username').fill('operador.exemplo');
  await page.locator('#password').fill('exemplo');
  await page.locator('#toggle').click();
  if(await page.locator('#password').getAttribute('type')!=='text')throw Error('visibility');
  await page.locator('#change').click();
  await page.locator('#branch').selectOption({label:'Açailândia'});
  await page.locator('#confirm').click();
  await page.locator('.submit').first().click();
  if(!(await page.locator('#status').innerText()).includes('Açailândia'))throw Error('preview submit');
  if(await page.locator('#password').inputValue())throw Error('password retained');
  await page.reload();
  const output=path.resolve(__dirname,'../../tmp/login-preview');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true,animations:'disabled'});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('LOGIN_PREVIEW_OK '+output);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
