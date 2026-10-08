import test from 'node:test';import assert from 'node:assert/strict';
import {linkPrefix,linkOutcome} from '../backend/auto-link.mjs';
import {Integrations} from '../backend/integrations.mjs';
import {configuredData,validateConfigurator} from '../backend/configurator.mjs';
test('physical versions select explicit prefix, unknown model blocks',()=>{
 for(const [v,p] of [['V7.3.2','GRS'],['V7.3.5','XRS'],['V7.2.2','AAA'],['V7.1.6','AAA']])assert.equal(linkPrefix({tracker_version:v}),p);
 assert.throws(()=>linkPrefix({model:'RS300'}));
});
test('only conclusive success or occupied target accepted',()=>{
 assert.equal(linkOutcome({status:200,body:'{"ok":true}'},4,5),'confirmed');
 for(const r of [{status:200,body:'{}'},{status:200,body:'{"ok":false}'},{status:200,body:'{"ok":true,"codEquipamento":9}'},{status:409,body:'{"message":"Duplicidade"}'},{status:500,body:'{"ok":true}'},{status:200,body:'<html>login</html>'}])assert.equal(linkOutcome(r,4,5),'uncertain');
 assert.equal(linkOutcome({status:409,body:'{"message":"Veículo já possui outro equipamento"}'},4,5),'occupied');
 assert.equal(linkOutcome({status:409,body:'{"message":"Equipamento já vinculado a outro veículo"}'},4,5),'uncertain');
});
test('direct saved-code association does no GET or retry',async()=>{
 const calls=[],s=new Integrations({request:async(url,opts)=>{calls.push({url,...opts});return{status:200,text:'{"ok":true}'}}});
 (await s.session('imperatriz')).token='synthetic';const r=await s.linkSaved('imperatriz','4','5');assert.equal(r.status,200);assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert.deepEqual(JSON.parse(calls[0].body),{codEquipamento:4,mover:false});
});
test('configurator saves physical type only in central data',()=>{
 const d=configuredData(null,{branch:'imperatriz',serial:'024000001',tracker_version:'V7.2.2'});assert.equal(d.model,'V7.2.2');assert.equal(d.tracker_version,'V7.2.2');
 assert.throws(()=>validateConfigurator({branch:'imperatriz',serial:'024000001',action:'save',tracker_version:'unknown'}));
});
