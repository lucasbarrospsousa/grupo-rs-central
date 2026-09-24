import test from 'node:test';
import assert from 'node:assert/strict';
import {businessMutation} from '../backend/business.mjs';
import {trackerClassification} from '../public/tracker-classification.js';
test('desktop classifications override raw model using identification, preserve unknowns',()=>{
 for(const [id,model,expected] of [['AAA - 342','RS300','V7.2.2/7.1.6'],['grs-001','Reutilizado','V7.3.2'],['XRS002','RS300','V7.3.5'],['','Reutilizado','V7.2.2/7.1.6'],['','custom','custom']])assert.equal(trackerClassification(id,model),expected);
});
function fixture(){const row={id:'one',serial:'024000001',version:1,data:{status:'Estoque',identification:'AAA - 342',model:'RS300',client:'RS300',plate:''}};const writes=[];const c={query:async(sql,args)=>{if(sql.startsWith('select')){assert.deepEqual(args,['one','imperatriz']);assert.match(sql,/for update/);return{rows:[row]};}writes.push(args);return{rowCount:1};}};return{row,writes,c};}
const args={path:'/api/install',method:'POST',body:{id:'one',version:1,plate:' abc1d23 ',confirmed:true},branch:'imperatriz',user:{},role:'admin',service:new Proxy({},{get(){throw Error('No external platform call allowed');}})};
test('manual installation preserves identification, records typed plate and installation date',async()=>{const {c,writes}=fixture();const out=await businessMutation(c,args);assert.equal(out.response.version,2);const saved=writes[0][1];assert.equal(saved.plate,'ABC1D23');assert.equal(saved.identification,'AAA - 342');assert.equal(saved.status,'Instalado');assert.equal(saved.model,'V7.2.2/7.1.6');assert.equal(saved.installed_at,saved.discharged_at);});
test('manual installation refuses missing confirmation, empty plate, stale version, installed row and reader',async()=>{
 for(const alter of [{body:{...args.body,confirmed:false}},{body:{...args.body,plate:' '}},{body:{...args.body,version:0}},{role:'reader'}]){const {c,writes}=fixture();await assert.rejects(businessMutation(c,{...args,...alter}));assert.equal(writes.length,0);}
 const f=fixture();f.row.data.status='Instalado';await assert.rejects(businessMutation(f.c,args));assert.equal(f.writes.length,0);
});
