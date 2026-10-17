// Isolated browser fixture: synthetic records only; no production API or credentials.
import http from 'node:http';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import path from 'node:path';
import {pageOptions,selectDevicePage} from '../backend/device-page.mjs';import {stockSummary,carrierSummary} from '../public/dashboard-model.js';
const root=fileURLToPath(new URL('../public/',import.meta.url)),calls=[];
const rows=Array.from({length:120},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,serial:String(24000000+i),branch:'imperatriz',status:i%2?'Instalado':'Estoque',identification:'AAA - '+i,plate:'ABC'+String(i).padStart(4,'0'),carrier:i%2?'Vivo':'Claro',version:1,installed_at:'2026-10-16',updated_at:'2026-10-17'}));
const user={username:'fixture',csrf:'fixture',branches:[{id:'imperatriz',name:'Imperatriz',role:'reader'}],permissions:{owner:false,views:['overview','stock','warehouse'],writes:[]}};
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');const json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));};
 if(u.pathname==='/__stats')return json(calls);
 if(u.pathname==='/mode.js'){res.setHeader('Content-Type','text/javascript');return res.end("export default 'homologacao'");}
 if(u.pathname.startsWith('/api/')){calls.push(u.pathname+u.search);if(u.pathname==='/api/session')return json(user);if(u.pathname==='/api/economy')return json({mode:'normal',enabled:true});
 if(u.pathname==='/api/devices'){if(u.searchParams.get('scope')==='summary')return json({cursor:'1',total:rows.length,statuses:stockSummary(rows),carriers:carrierSummary(rows)});if(u.searchParams.get('scope')==='page')return json(u.searchParams.get('since')==='1'?{cursor:'1',unchanged:true}:{...selectDevicePage(rows,'imperatriz',pageOptions(u.searchParams)),cursor:'1'});res.statusCode=500;return json({error:'Full-list load forbidden in paging fixture'});}
 if(u.pathname==='/api/integrations/stock-page')return json({results:(u.searchParams.get('ids')||'').split(',').map(id=>({id,ok:false,message:'Teste offline'}))});
 return json({ok:true,rows:[],results:[],allowed:[],state:'on',mode:'normal'});}
 try{const target=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!target.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');res.end(await readFile(target));}catch{res.statusCode=404;res.end();}
});server.listen(4188,'127.0.0.1',()=>console.log('Offline paging fixture: http://127.0.0.1:4188'));
