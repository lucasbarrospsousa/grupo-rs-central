import test from 'node:test';import assert from 'node:assert/strict';
import {activeFleetTotal,PortalRead} from '../backend/portal-read.mjs';
import {maintenanceShare} from '../public/maintenance-share.js';
const card=n=>'<h5>Veículos</h5><p class="value">'+n+'</p><small>Ativos na frota</small>';
test('uses active vehicles, not equipment or client totals',()=>{assert.equal(activeFleetTotal('<h5>Equipamentos</h5><p>9999</p>'+card('4.715')),4715);assert.throws(()=>activeFleetTotal(card('5')+card('6')));assert.throws(()=>activeFleetTotal('<h5>Veículos</h5><p>12</p>'));});
test('percentage respects denominator and incomplete totals',()=>{assert.equal(maintenanceShare(455,4715).toFixed(2),'9.65');assert.equal(maintenanceShare(0,10),0);for(const n of [null,undefined,0,-1,400])assert.equal(maintenanceShare(455,n),null);});
test('fleet query failure preserves maintenance list',async()=>{const p=new PortalRead({});p.page=async(b,path)=>{if(path==='/home_adm.php')throw Error('Indisponível');return 'Veículos (0)<tbody></tbody>';};const r=await p.maintenance('imperatriz');assert.equal(r.count,0);assert.equal(r.fleet_total,null);assert.equal(r.fleet_warning,'Indisponível');});
