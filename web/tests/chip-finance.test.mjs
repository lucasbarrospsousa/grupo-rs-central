import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeCosts,summarizeInvoices,parseAryaCosts,refreshCostSnapshots} from '../backend/warehouse-costs.mjs';
import {validateFinanceSource,importFinanceSource} from '../backend/chip-finance-import.mjs';
const a='8955000000000000001',b='8955000000000000002';
test('Full supplier inventory includes unlinked chips and all branches without double counting links',()=>{
 const devices=[{serial:'1',branch_id:'imperatriz',iccid:a},{serial:'2',branch_id:'maraba',iccid:a}],before=JSON.stringify(devices);
 const sources=[{provider:'arya',checked_at:'2026-01-01',rows:new Map([[a,{active:true,cents:399}]])},{provider:'link',checked_at:'2026-01-01',rows:new Map([[b,{active:true,cents:449}]])}];
 const r=summarizeCosts(devices,sources,{allProviders:true});assert.equal(r.total_cents,848);assert.equal(r.duplicates,1);assert.equal(r.items.find(x=>x.iccid===b).associations.length,0);assert.equal(r.items[0].associations[1].branch,'maraba');assert.equal(JSON.stringify(devices),before);
 sources[1].rows.set(a,{active:true,cents:500});assert.equal(summarizeCosts(devices,sources,{allProviders:true}).conflicts,1);
});
test('Never connected active chips count; pending and blocked chips do not',()=>{
 const rows=parseAryaCosts(`ICCID;STATUS;VALOR NEGOCIADO;OPERADORA\n${a};ATIVO - NUNCA CONECTADO;3,99;TIM\n${b};PENDENTE;3,99;TIM`);
 assert.equal(summarizeCosts([],{rows,checked_at:'2026-01-01'},{allProviders:true}).total_cents,399);
});
test('Invoice totals stay separate and never mix different due months',()=>{
 const s=[{provider:'arya',invoices:[{id:'1',due_date:'2026-10-15',total_cents:100}]},{provider:'link',invoices:[{id:'2',due_date:'2026-09-10',total_cents:200}]}];
 assert.equal(summarizeInvoices(s).total_cents,100);assert.equal(summarizeInvoices(s).complete,false);s[1].invoices.push({id:'3',due_date:'2026-10-10',total_cents:300});assert.equal(summarizeInvoices(s).total_cents,400);assert.equal(summarizeInvoices(s).complete,true);
});
test('Reviewed import validates invoice sums, retains history and never writes links',async()=>{
 const source={provider:'link',checked_at:'2026-10-14',items:[{iccid:a,active:true,cents:399}],invoices:[{id:'new',due_date:'2026-10-10',total_cents:399,source_url:'https://example.test/invoice',checked_at:'2026-10-14',items:[{iccid:a,cents:399}]}]};
 assert.throws(()=>validateFinanceSource({...source,items:[...source.items,...source.items]}));
 assert.throws(()=>validateFinanceSource({...source,invoices:[{...source.invoices[0],total_cents:400}]}));
 let writes=0;const c={query:async(sql,args)=>{assert.ok(!/devices|warehouse_items/.test(sql));if(sql.startsWith('select'))return{rows:[{checked_at:'2026-10-13',invoices:[{id:'old'}]}]};writes++;assert.equal(JSON.parse(args[3]).length,2);return{};}};await importFinanceSource(c,source);assert.equal(writes,1);
});
test('Refresh only targets Arya, even if Link has no snapshot',async()=>{
 const providers=[];const pool={connect:async()=>({release(){},query:async(sql,args)=>{if(sql.startsWith('update'))providers.push(args[0]);return{rows:[],rowCount:0};}})};
 await refreshCostSnapshots(pool,{user_id:'fake'},{});assert.deepEqual(providers,['arya']);
});
