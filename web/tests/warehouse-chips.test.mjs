import test from 'node:test';
import assert from 'node:assert/strict';
import {filterChips,chipSituation} from '../public/warehouse-chips.js';
const chip={kind:'chip',serial:'8955000000000000001',status:'Disponível',classification:'Reserva',chip_provider:'arya',chip_operator:'ALGAR'};
test('chip filters preserve ICCID text and combine category, provider and situation',()=>{
 const rows=[chip,{...chip,serial:'8955000000000000002',classification:'Estoque',chip_phone:'5599990001001'},{...chip,chip_provider:'link',classification:'Emergência'},{...chip,status:'Utilizado'},{...chip,kind:'device'}];
 assert.equal(filterChips(rows).length,3);
 assert.deepEqual(filterChips(rows,{query:'  8955000000000000002  ',provider:'arya',category:'Estoque'}),[rows[1]]);
 assert.deepEqual(filterChips(rows,{query:'link',provider:'link',category:'Emergência'}),[rows[2]]);
 assert.equal(filterChips(rows,{query:'algar',category:'Reserva',status:''}).length,2);
 assert.equal(filterChips(rows,{query:'not found'}).length,0);
});
test('activation states are distinct from classification; absent evidence is not declared active',()=>{
 assert.equal(chipSituation(chip)[0],'Aguardando ativação manual');
 assert.equal(chipSituation({...chip,activation_state:'requested'})[0],'Ativação solicitada');
 assert.equal(chipSituation({...chip,activation_state:'uncertain'})[0],'Resposta não confirmada');
 assert.equal(chipSituation({...chip,activation_state:'active'})[0],'Ativo confirmado');
 assert.equal(chipSituation({...chip,chip_provider:'link'})[0],'A conferir');
 assert.equal(chipSituation({...chip,classification:'Estoque',chip_phone:'5599990001001'})[0],'Disponível para uso');
 assert.equal(chipSituation({...chip,status:'Utilizado',activation_state:'active'})[0],'Utilizado');
});
