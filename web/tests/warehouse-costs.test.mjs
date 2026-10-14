import test from 'node:test';import assert from 'node:assert/strict';
import {brlCents,parseAryaCosts,summarizeCosts,aryaCostSnapshot,decimalCents,parseLinkCost,linkCostSnapshot} from '../backend/warehouse-costs.mjs';
import {api} from '../backend/api.mjs';
const a='8955000000000000001',b='8955000000000000002',c='8955000000000000003';
const csv='ICCID;STATUS;"VALOR NEGOCIADO";OPERADORA;PLANO\r\n"=""'+a+'""";ATIVO;3,99;TIM;"20 MB; compartilhado"\r\n'+b+';BLOQUEADO;4,49;VIVO;20 MB\r\n';
test('APN and device associations retain each link without doubling monthly cost',()=>{
 const rows=new Map([[a,{active:true,cents:399,operator:'TIM'}],[b,{active:true,cents:399,operator:'TIM'}]]);
 const r=summarizeCosts([{serial:'01',iccid:a,apn:'hinova.br',plate:'ABC1D23'},{serial:'02',iccid:a,apn:'outro.br'},{serial:'03',iccid:b,apn:'hinova.br'}],{rows,checked_at:'now'});
 assert.equal(r.total_cents,798);assert.equal(r.groups.length,2);assert.equal(r.items[0].associations[0].plate,'ABC1D23');assert.deepEqual(r.items[0].apns,['hinova.br','outro.br']);assert.equal(r.groups.reduce((n,g)=>n+g.count*g.cents,0),r.total_cents);
});
test('CSV real contract: quoted Excel ICCID, semicolon, BRL cents and blocked status',()=>{const rows=parseAryaCosts(csv);assert.equal(rows.size,2);assert.equal(rows.get(a).cents,399);assert.equal(rows.get(a).plan,'20 MB; compartilhado');assert.equal(rows.get(b).active,false);assert.equal(brlCents('1.234,50'),123450);for(const value of ['',null,'3.99','-1,00','erro'])assert.equal(brlCents(value),null);assert.equal(brlCents('0,00'),0);});
test('Subtotal covers unique active SIMs only; missing and unmatched stay explicit',()=>{const r=summarizeCosts([{serial:'1',iccid:a},{serial:'2',iccid:a},{serial:'3',iccid:b},{serial:'4',iccid:c},{serial:'5',iccid:''}],{rows:parseAryaCosts(csv),checked_at:'now'});assert.equal(r.total_cents,399);assert.equal(r.confirmed,1);assert.equal(r.duplicates,1);assert.equal(r.inactive,1);assert.equal(r.missing,1);assert.equal(r.pending,1);assert.equal(r.complete,false);assert.equal(r.items[0].devices.length,2);});
test('Rejects HTML, malformed CSV and duplicate ICCIDs instead of displaying zero',()=>{for(const text of ['<html>Login</html>',csv+'"unterminated',csv+a+';ATIVO;3,99;TIM;20 MB\n'])assert.throws(()=>parseAryaCosts(text));});
test('Concurrent and repeat reads share one account export; failures are not cached',async()=>{let calls=0;const service={aryaRequest:async(path,payload)=>{calls++;assert.equal(path,'/customer/inventary/export');assert.deepEqual(payload,{filters:{},inventaryFlag:'default'});return csv;}};const [x,y]=await Promise.all([aryaCostSnapshot(service),aryaCostSnapshot(service)]);assert.equal(x,y);await aryaCostSnapshot(service);assert.equal(calls,1);let bad=0;const retry={aryaRequest:async()=>{if(!bad++)throw Error('offline');return csv;}};await assert.rejects(aryaCostSnapshot(retry));assert.equal((await aryaCostSnapshot(retry)).rows.size,2);});
test('Costs API enforces owner and branch membership before exporting; SQL excludes inactive/deleted devices',async()=>{
 for(const [owner,member,expected] of [[false,true,403],[true,false,403],[true,true,200]]){
  let calls=0,selected=false;
  const pool={query:async(sql,args)=>{
   if(sql.includes('from central_homologacao.sessions'))return{rows:[{user_id:'owner',username:owner?'lucasabm':'reader'}]};
   if(sql.includes('select 1 from central_homologacao.memberships'))return{rowCount:1,rows:[{}]};
   if(sql.startsWith('select role'))return{rows:member?[{role:'admin'}]:[]};
   if(sql.includes('from central_homologacao.chip_cost_snapshots'))return{rows:[{provider:'arya',items:[...parseAryaCosts(csv).values()],checked_at:new Date().toISOString()}]};
   if(sql.includes('from central_homologacao.warehouse_items'))return{rows:[{iccid:a,serial:'024000001'}]};
   if(sql.includes('from central_homologacao.devices')){selected=true;assert.match(sql,/deleted_at is null/);assert.match(sql,/order by branch_id,serial/);assert.deepEqual(args,[]);return{rows:[{serial:'024000001',iccid:a}]};}
   return{rows:[]};},connect:async()=>({...pool,release(){}})};
  const req={url:'/api/warehouse-costs?branch=imperatriz',method:'GET',headers:{cookie:'central_session='+'a'.repeat(64)}},result={};
  await api(pool,{integrationService:{aryaRequest:async()=>{calls++;return csv;}}})(req,{setHeader(){},writeHead(status){result.status=status;},end(body){result.body=JSON.parse(body);}});
  assert.equal(result.status,expected);assert.equal(calls,0);assert.equal(selected,expected===200);if(expected===200){assert.equal(result.body.total_cents,399);assert.equal(result.body.inventory_items[0].cents,399);}
 }
});
test('Link uses sale item price, not wholesale, and lifecycle rather than connectivity',()=>{
 const raw={iccid:a,phase__name:'Vinculado',charge_start:'2026-01-01',status__name:'Standby',item__base_price:'4.49',boughtplan__base_price:'3.01',operator__name:'Claro'};
 assert.equal(parseLinkCost(raw).cents,449);assert.equal(parseLinkCost(raw).active,true);assert.equal(parseLinkCost({...raw,phase__name:'Estoque'}).active,false);
 for(const x of [null,'','4,49','4.499','-1','NaN'])assert.equal(decimalCents(x),null);assert.equal(decimalCents('3.9'),390);assert.equal(decimalCents('0'),0);
});
test('Link queries only supplied ICCIDs in batches and rejects ambiguous replies',async()=>{
 const ids=Array.from({length:201},(_,i)=>'8955'+String(i).padStart(15,'0')),calls=[];
 const service={linkCostBatch:async batch=>{calls.push(batch);return batch.map(iccid=>({iccid,phase__name:'Vinculado',charge_start:'2026-01-01',item__base_price:'4.49'}));}};
 assert.equal((await linkCostSnapshot(service,ids)).rows.size,201);assert.deepEqual(calls.map(x=>x.length),[100,100,1]);assert.deepEqual(calls.flat(),ids);
 assert.equal((await linkCostSnapshot({linkCostBatch:async()=>[]},[a])).rows.get(a).found,false);
 assert.equal((await linkCostSnapshot({linkCostBatch:async()=>[{iccid:b,phase__name:'Vinculado'},{iccid:a+'00',phase__name:'Quarentena cancelado'}]},[a])).rows.get(a).found,false);
 await assert.rejects(linkCostSnapshot({linkCostBatch:async()=>({error:true})},[a]),/lista/);
});
test('Both providers sum once, expose every tariff and distinguish provider failure from absence',()=>{
 const arya={provider:'arya',checked_at:'2026-10-13T12:00:00Z',rows:parseAryaCosts(csv)},link={provider:'link',checked_at:'2026-10-13T12:00:00Z',rows:new Map([[c,{iccid:c,active:true,cents:449,operator:'Claro'}]])};
 const devices=[{serial:'1',iccid:a},{serial:'2',iccid:c},{serial:'3',iccid:c}];let r=summarizeCosts(devices,[arya,link]);assert.equal(r.total_cents,848);assert.equal(r.confirmed,2);assert.equal(r.duplicates,1);assert.equal(r.complete,true);assert.equal(r.providers[1].total_cents,449);
 link.rows.set(a,{active:true,cents:100,operator:'TIM'});r=summarizeCosts(devices,[arya,link]);assert.equal(r.conflicts,1);assert.equal(r.total_cents,449);assert.equal(r.complete,false);
 link.rows.clear();link.last_error='offline';r=summarizeCosts(devices,[arya,link]);assert.equal(r.pending,1);assert.equal(r.not_found,0);assert.equal(r.complete,false);
});
