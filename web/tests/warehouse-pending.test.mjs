import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingChips,importPendingChips} from '../backend/warehouse-pending.mjs';
test('Only valid pending ICCIDs, deduplicated; active and blocked excluded',()=>{
 const a={iccid:'8955000000000000001',status:'PENDENTE',active:false};
 assert.equal(pendingChips([a,a,{...a,iccid:'bad'},{...a,active:true},{...a,status:'BLOQUEADO'}]).length,1);
});
test('Missing or failed source cannot become empty successful import',async()=>{
 for(const source of [undefined,{checked_at:'2026-10-14',last_error:'failed'}]){
 const c={query:async sql=>({rows:sql.startsWith('select items')?[source].filter(Boolean):[]})};
 await assert.rejects(()=>importPendingChips(c),/Não foi possível/);
 }
});
test('Bulk insert preserves duplicates, links and activation fields',async()=>{
 const calls=[],c={query:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('select items'))return {rows:[{checked_at:'2026-10-14',items:[{iccid:'8955000000000000001',status:'PENDENTE'}]}]};return {rows:[]};}};
 const r=await importPendingChips(c);assert.equal(r.count,0);assert.equal(r.preserved,1);
 const sql=calls.at(-1).sql;assert.match(sql,/on conflict\(kind,serial\) do nothing/);assert.match(sql,/not exists.*central_homologacao.devices/s);assert.doesNotMatch(sql,/update |activation_state|activation_batch/i);
});
