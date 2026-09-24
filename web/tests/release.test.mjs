import test from 'node:test';
import assert from 'node:assert/strict';
import {carrierSummary,stockSummary} from '../public/dashboard-model.js';
import {api} from '../backend/api.mjs';
import {integrations} from '../backend/integrations.mjs';
import {hash} from '../backend/auth.mjs';
test('carrier chart preserves every row and groups spelling variants without inventing data',()=>{
 const rows=[{carrier:'MULTI OPERADORA'},{carrier:'Multi Operador'},{carrier:'vivo'},{carrier:''},{carrier:'Vivo'}];
 const summary=carrierSummary(rows);
 assert.equal(summary.reduce((n,r)=>n+r.count,0),5);assert.equal(summary.reduce((n,r)=>n+r.percent,0),100);
 assert.equal(summary.find(r=>r.label==='Multioperadora').count,2);assert.equal(summary.find(r=>r.label==='Vivo').count,2);
 assert.deepEqual(carrierSummary([]),[]);assert.ok(stockSummary([]).every(r=>r.count===0));
});
test('warehouse default API checks the carrier before insertion and rejects an unconfirmed chip',async()=>{
 const original=integrations.carrier;let confirmed=true,checks=0,inserts=0;
 integrations.carrier=async(provider,serial)=>{assert.equal(provider,'arya');assert.equal(serial,'8955320210000000001');checks++;return{ok:confirmed};};
 const client={release(){},async query(sql){if(sql.startsWith('insert into central_homologacao.warehouse_items'))inserts++;return{rows:[],rowCount:1};}};
 const pool={async connect(){return client;},async query(sql){return{rows:sql.includes('sessions s')?[{user_id:'00000000-0000-4000-8000-000000000001',csrf_hash:hash('test'),username:'test'}]:[{role:'admin'}]};}};
 async function call(){let status,result;const req={url:'/api/warehouse?branch=imperatriz',method:'POST',headers:{host:'localhost',origin:'http://localhost',cookie:'central_session='+'a'.repeat(64),'x-csrf-token':'test','idempotency-key':'00000000-0000-4000-8000-000000000002'},async *[Symbol.asyncIterator](){yield JSON.stringify({kind:'chip',serial:'8955320210000000001'});}};await api(pool)(req,{writeHead(code){status=code;},end(text){result=JSON.parse(text);}});return{status,result};}
 try{assert.equal((await call()).status,200);assert.equal(inserts,1);confirmed=false;assert.equal((await call()).status,422);assert.equal(inserts,1);assert.equal(checks,2);}finally{integrations.carrier=original;}
});
