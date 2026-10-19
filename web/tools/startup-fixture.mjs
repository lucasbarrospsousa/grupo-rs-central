import {bundlePaths} from '../backend/startup-bundle.mjs';
import {costView} from '../backend/cost-view.mjs';
import {selectWarehouseView} from '../backend/warehouse-view.mjs';
import {selectHistoryView} from '../backend/history-view.mjs';
// Isolated browser fixture: synthetic records only; no production API or credentials.
import http from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {pageOptions,selectDevicePage} from '../backend/device-page.mjs';import {stockSummary,carrierSummary} from '../public/dashboard-model.js';
const root=path.resolve(fileURLToPath(new URL('../public/',import.meta.url))),calls=[];
const rows=Array.from({length:120},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,serial:String(24000000+i),branch:'imperatriz',status:i%2?'Instalado':'Estoque',identification:'AAA - '+i,plate:'ABC'+String(i).padStart(4,'0'),carrier:i%2?'Vivo':'Claro',version:1,installed_at:'2026-10-16',updated_at:'2026-10-17'}));
const warehouse={rows:Array.from({length:150},(_,i)=>({id:'w'+i,serial:'8955000000000000'+String(i).padStart(4,'0'),kind:i<50?'device':'chip',branch:'imperatriz',status:'Disponível',classification:i%3?'Estoque':'Reserva',received_at:'2026-10-17',version:1,chip_provider:'arya'})),movements:[]};
const user={username:'fixture',csrf:'fixture',branches:[{id:'imperatriz',name:'Imperatriz',role:'admin'}],permissions:{owner:true,views:['overview','stock','warehouse','tracking','bulk','maintenance','records','route','sms'],writes:[]}};
const handle=async(req,res,internal=false)=>{const u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");const json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};
 if(u.pathname==='/__stats')return json(calls);
 if(u.pathname==='/mode.js'){res.setHeader('Content-Type','text/javascript');return res.end("export default 'homologacao'");}
 if(u.pathname.startsWith('/api/')){if(!internal)calls.push(u.pathname+u.search);if(u.pathname==='/api/login')return json({ok:true});if(u.pathname==='/api/session')return json(user);if(u.pathname==='/api/economy')return json({mode:'normal',enabled:true});
 if(u.pathname==='/api/startup-bundle'){
 const paths=bundlePaths(user,user.permissions,user.branches,'imperatriz').filter(p=>!p.includes('scope=summary')),panels=[];
 await new Promise(r=>setTimeout(r,4000));
 for(const path of paths)await handle({url:'/api/'+path,method:'GET'},{setHeader(){},end(text){panels.push({path,ok:true,data:JSON.parse(text)})}},true);
 return json({ok:true,panels});
 }
 if(u.pathname==='/api/warehouse'){if(!u.searchParams.has('view')){res.statusCode=500;return json({error:'Full warehouse forbidden'});}return json({...selectWarehouseView(warehouse,u.searchParams),cursor:'1'});}
 if(u.pathname==='/api/history')return json({...selectHistoryView(Array.from({length:29},(_,i)=>({id:'h'+i,client:'Cliente '+i,plate:'ABC'+i,currentSerial:'024'+i,entry:'2026-10-17T10:00:00Z',reason:'Sem comunicação'})),u.searchParams),cursor:'h1'});
 if(u.pathname==='/api/warehouse-costs')return json(costView({ok:true,items:warehouse.rows.filter(r=>r.kind==='chip').map(r=>({iccid:r.serial,provider:'arya',operator:'TIM',state:'Confirmado',cents:320,devices:[]})),inventory_items:[],total_cents:32000,confirmed:100,chip_count:100,checked_at:'2026-10-17T10:00:00Z',providers:[],billing:{invoices:[]}},u.searchParams));
 if(u.pathname==='/api/devices'){if(['lookup','serials','available'].includes(u.searchParams.get('scope')))return json({rows:rows.slice(0,10),total:120,page:1,customers:[],cursor:'1'});if(u.searchParams.get('scope')==='summary'){await new Promise(r=>setTimeout(r,1000));return json({cursor:'1',total:rows.length,statuses:stockSummary(rows),carriers:carrierSummary(rows)});}if(u.searchParams.get('scope')==='page')return json(u.searchParams.get('since')==='1'?{cursor:'1',unchanged:true}:{...selectDevicePage(rows,'imperatriz',pageOptions(u.searchParams)),cursor:'1'});res.statusCode=500;return json({error:'Full-list load forbidden in paging fixture'});}
 if(u.pathname==='/api/integrations/stock-page')return json({results:(u.searchParams.get('ids')||'').split(',').map(id=>({id,ok:false,message:'Teste offline'}))});
 return json({ok:true,rows:[],results:[],allowed:[],state:'on',mode:'normal'});}
 try{const target=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!target.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');let content=await readFile(target);if(u.pathname==='/')content=content.toString().replace('<head>',"<head><script>localStorage.setItem('central-view:fixture',JSON.stringify({branch:'imperatriz',route:'warehouse'}));</script>");res.end(content);}catch{res.statusCode=404;res.end();}
};const server=http.createServer(handle);server.listen(4189,'127.0.0.1',()=>console.log('Offline paging fixture: http://127.0.0.1:4189'));
