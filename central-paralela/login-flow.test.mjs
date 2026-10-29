import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('login paints returned data with one request and ignores obsolete responses',async()=>{
const code=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const handler=code.slice(code.indexOf("form.addEventListener('submit'"),code.indexOf("\n$('#exit')"));
let submitHandler,calls=[],shown=[];const context={form:{username:{value:'user'},addEventListener:(_,h)=>submitHandler=h},submit:{disabled:false},message:{},password:{value:'synthetic'},generation:0,status:{},api:async(path)=>{calls.push(path);return {tracking:[{rows:[1]}]};},showSession:u=>shown.push(u)};
runInNewContext(handler,context);await submitHandler({preventDefault(){}});assert.deepEqual(calls,['login']);assert.equal(shown[0].tracking[0].rows.length,1);assert.equal(context.password.value,'');
context.api=async()=>{context.generation++;return {};};await submitHandler({preventDefault(){}});assert.equal(shown.length,1);
});
