import test from 'node:test';import assert from 'node:assert/strict';
import {brlCents,parseAryaCosts,summarizeCosts,aryaCostSnapshot} from '../backend/warehouse-costs.mjs';
import {api} from '../backend/api.mjs';
const a='8955000000000000001',b='8955000000000000002',c='8955000000000000003';
const csv='ICCID;STATUS;"VALOR NEGOCIADO";OPERADORA;PLANO\r\n"=""'+a+'""";ATIVO;3,99;TIM;"20 MB; compartilhado"\r\n'+b+';BLOQUEADO;4,49;VIVO;20 MB\r\n';
test('CSV real contract: quoted Excel ICCID, semicolon, BRL cents and blocked status',()=>{const rows=parseAryaCosts(csv);assert.equal(rows.size,2);assert.equal(rows.get(a).cents,399);assert.equal(rows.get(a).plan,'20 MB; compartilhado');assert.equal(rows.get(b).active,false);assert.equal(brlCents('1.234,50'),123450);for(const value of ['',null,'3.99','-1,00','erro'])assert.equal(brlCents(value),null);assert.equal(brlCents('0,00'),0);});
test('Subtotal covers unique active SIMs only; missing and unmatched stay explicit',()=>{const r=summarizeCosts([{serial:'1',iccid:a},{serial:'2',iccid:a},{serial:'3',iccid:b},{serial:'4',iccid:c},{serial:'5',iccid:''}],{rows:parseAryaCosts(csv),checked_at:'now'});assert.equal(r.total_cents,399);assert.equal(r.confirmed,1);assert.equal(r.duplicates,1);assert.equal(r.inactive,1);assert.equal(r.missing,1);assert.equal(r.not_found,1);assert.equal(r.complete,false);assert.equal(r.items[0].devices.length,2);});
test('Rejects HTML, malformed CSV and duplicate ICCIDs instead of displaying zero',()=>{for(const text of ['<html>Login</html>',csv+'"unterminated',csv+a+';ATIVO;3,99;TIM;20 MB\n'])assert.throws(()=>parseAryaCosts(text));});
test('Concurrent and repeat reads share one account export; failures are not cached',async()=>{let calls=0;const service={aryaRequest:async(path,payload)=>{calls++;assert.equal(path,'/customer/inventary/export');assert.deepEqual(payload,{filters:{},inventaryFlag:'default'});return csv;}};const [x,y]=await Promise.all([aryaCostSnapshot(service),aryaCostSnapshot(service)]);assert.equal(x,y);await aryaCostSnapshot(service);assert.equal(calls,1);let bad=0;const retry={aryaRequest:async()=>{if(!bad++)throw Error('offline');return csv;}};await assert.rejects(aryaCostSnapshot(retry));assert.equal((await aryaCostSnapshot(retry)).rows.size,2);});
test('Costs API enforces owner and branch membership before exporting; SQL excludes inactive/deleted devices',async()=>{
 for(const [owner,member,expected] of [[false,true,403],[true,false,403],[true,true,200]]){
  let calls=0,selected=false;
  const pool={query:async(sql,args)=>{
   if(sql.includes('from central_homologacao.sessions'))return{rows:[{user_id:'owner',username:owner?'lucasabm':'reader'}]};
   if(sql.includes('select 1 from central_homologacao.memberships'))return{rowCount:1,rows:[{}]};
   if(sql.startsWith('select role'))return{rows:member?[{role:'admin'}]:[]};
   if(sql.includes('from central_homologacao.devices')){selected=true;assert.match(sql,/deleted_at is null/);assert.match(sql,/<>'Inativos'/);assert.deepEqual(args,['imperatriz']);return{rows:[{serial:'024000001',iccid:a}]};}
   return{rows:[]};},connect:async()=>({...pool,release(){}})};
  const req={url:'/api/warehouse-costs?branch=imperatriz',method:'GET',headers:{cookie:'central_session='+'a'.repeat(64)}},result={};
  await api(pool,{integrationService:{aryaRequest:async()=>{calls++;return csv;}}})(req,{setHeader(){},writeHead(status){result.status=status;},end(body){result.body=JSON.parse(body);}});
  assert.equal(result.status,expected);assert.equal(calls,expected===200?1:0);assert.equal(selected,expected===200);if(expected===200)assert.equal(result.body.total_cents,399);
 }
});
