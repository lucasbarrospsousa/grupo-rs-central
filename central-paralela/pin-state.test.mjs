import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});vm.runInContext(readFileSync(new URL('./public/pin-state.js',import.meta.url),'utf8'),context);
const now=Date.now(),sample={ok:true,ignition:true,updated_at:new Date(now-30000).toISOString(),gps_at:new Date(now-30000).toISOString(),gps_signal:'1',lat:-5,lng:-47};
test('needles follow Central ignition, communication and GPS precedence',()=>{const pin=x=>context.devicePin(x,now).tone;assert.equal(pin(sample),'green');assert.equal(pin({...sample,ignition:false}),'red');assert.equal(pin({...sample,gps_at:new Date(now-1800000).toISOString()}),'purple');assert.equal(pin({...sample,updated_at:new Date(now-3600000).toISOString()}),'amber');assert.equal(pin({ok:false,message:'Falha'}),'amber');assert.equal(pin(undefined),'neutral');assert.equal(pin({...sample,ignition:''}),'neutral');assert.equal(pin({...sample,gps_signal:'0'}),'green');assert.equal(pin({...sample,query_error:'Falha'}),'amber');});
