import test from 'node:test';
import assert from 'node:assert/strict';
import {automationInput,measuredRequest,trackQueries,querySource} from '../backend/query-usage.mjs';
test('only supported intervals and explicit boolean are accepted',()=>{
 for(const interval_minutes of [5,10,30,1440])for(const enabled of [true,false])assert.deepEqual(automationInput({enabled,interval_minutes}),{enabled,interval_minutes});
 for(const body of [{enabled:true,interval_minutes:1},{enabled:'false',interval_minutes:5},{enabled:false,interval_minutes:'30'}])assert.throws(()=>automationInput(body),{status:400});
});
test('actual requests, retries and errors are aggregated once and isolated across concurrent origins',async()=>{
 const saved=[];const pool={async query(sql,args){saved.push(args);}};
 const good=async()=>({status:200}),bad=async()=>{throw Error('timeout');};
 await Promise.all(['page','automatic'].map(mode=>trackQueries(pool,mode,async()=>{
  await measuredRequest(good,'https://imp.ogrupors.com.br/api_rest_app/test');
  await assert.rejects(measuredRequest(bad,'https://imp.ogrupors.com.br/api_rest_app/test'));
  await measuredRequest(good,'https://api-arya.hinovaconecta.com.br/auth');
 })));
 assert.equal(saved.length,2);
 assert.deepEqual(new Set(saved.map(r=>r[0])),new Set(['page','automatic']));
 for(const [,json] of saved)assert.deepEqual(JSON.parse(json),[{source:'api',total:2,failed:1},{source:'arya',total:1,failed:0}]);
 await trackQueries(pool,'page',async()=>{});assert.equal(saved.length,2);
});
test('page queries do not depend on automation state and monitoring failure preserves their result',async()=>{
 const old=console.warn;console.warn=()=>{};
 try{assert.equal(await trackQueries({query:async()=>{throw Error('database');}},'page',()=>measuredRequest(async()=>42,'https://lsm.tnsi.com.br/api/sims')),42);}finally{console.warn=old;}
 assert.equal(querySource('https://mab.ogrupors.com.br/login'),'portal');
 assert.equal(querySource('https://example.org/'),'other');
});
