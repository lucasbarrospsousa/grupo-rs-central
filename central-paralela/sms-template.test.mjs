import test from 'node:test';
import assert from 'node:assert/strict';
import {standardSms} from './sms-template.mjs';

test('standard SMS selects the correct base and provider without fallback',()=>{
 const bases=['imperatriz','araguaina','acailandia','maraba'];
 for(const [index,branch] of bases.entries())for(const [apn,user] of [['hinova.br','hinova'],['linksolutions.br','link']]){
  const host=`grupors${index+1}.ddns.net`;
  assert.equal(standardSms('024999999',apn,branch).command,`ST300NTW;024999999;319H;0;${apn};${user};${user};${host};5940;${host};5941;#`);
 }
 assert.throws(()=>standardSms('024999999','unknown','maraba'));
 assert.throws(()=>standardSms('024999999','hinova.br','unknown'));
 assert.throws(()=>standardSms('999','hinova.br','maraba'));
});
