import test from 'node:test';
import assert from 'node:assert/strict';
import {SqlRepository} from '../public/sql-repository.js';
const data=()=>({rows:[],visits:[],movements:[]});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};};
test('entering warehouse and stock refreshes saved state without refetching on every render',async()=>{
 const r=repo();r.activate('a','warehouse');await r.load('a',{route:'warehouse',force:false});
 r.activate('a','warehouse');await r.load('a',{route:'warehouse',force:false});assert.equal(r.calls.length,1);
 r.activate('a','stock');await r.load('a',{route:'stock',force:false});
 r.activate('a','warehouse');await r.load('a',{route:'warehouse',force:false});assert.equal(r.calls.length,3);
});
test('saving an ICCID invalidates warehouse so the next visit gets the movement',async()=>{
 const r=repo();r.activate('a','warehouse');await r.load('a',{route:'warehouse',force:false});
 await r.saveDevice('a',{serial:'024000001',iccid:'8955000000000000001'});
 assert.equal(r.ready('a','warehouse'),false);assert.equal(r.ready('a','stock'),true);
 await r.load('a',{route:'warehouse',force:false});assert.equal(r.calls.at(-1),'warehouse?branch=a');
});
function repo(){const r=new SqlRepository();r.user={permissions:{owner:true}};r.calls=[];r.request=async path=>{r.calls.push(path);return data()};return r;}
test('overview requests only devices; maintenance and warehouse load on demand',async()=>{
 const r=repo();await r.load('a',{route:'overview',force:false});assert.deepEqual(r.calls,['devices?branch=a']);
 await r.load('a',{route:'maintenance',force:false});assert.deepEqual(r.calls,['devices?branch=a','history?branch=a']);
 await r.load('a',{route:'warehouse',force:false});assert.equal(r.calls.at(-1),'warehouse?branch=a');
 for(const route of ['sms','settings','users'])await r.load('a',{route,force:false});assert.equal(r.calls.length,3);
});
test('deduplicates pending loads and does not mark a failed request ready',async()=>{
 const r=repo(),d=deferred();r.request=()=>{r.calls.push('devices');return d.promise};
 const a=r.load('a',{route:'stock',force:false}),b=r.load('a',{route:'overview',force:false});assert.equal(r.calls.length,1);assert.equal(r.ready('a','stock'),false);
 d.reject(Error('offline'));await Promise.allSettled([a,b]);assert.equal(r.ready('a','stock'),false);
 r.request=async()=>data();await r.load('a',{route:'stock',force:false});assert.equal(r.ready('a','stock'),true);
});
test('invalidated response cannot overwrite newer equipment after a mutation',async()=>{
 const r=repo(),old=deferred();r.request=()=>old.promise;const pending=r.load('a',{route:'stock',force:false});
 r.request=async()=>({rows:[{id:'new',branch:'a'}]});await r.load('a',{route:'stock'});old.resolve({rows:[{id:'old',branch:'a'}]});await pending;assert.equal(r.devices[0].id,'new');
});
test('late warehouse response cannot replace another branch or change active branch',async()=>{
 const r=repo(),old=deferred();r.currentBranch='a';r.request=()=>old.promise;const pending=r.load('a',{route:'warehouse',force:false});
 r.currentBranch='b';r.request=async()=>({rows:[{id:'b',received_at:'2026-09-27'}],movements:[]});await r.load('b',{route:'warehouse',force:false});
 old.resolve({rows:[{id:'a'}],movements:[]});await pending;assert.equal(r.currentBranch,'b');assert.equal(r.warehouse[0].id,'b');assert.equal(r.ready('a','warehouse'),false);
});
test('permissions still limit queries; logout discards in-flight data',async()=>{
 const r=repo();r.user.permissions={owner:false,views:['sms'],writes:[]};await r.load('a',{route:'maintenance'});assert.equal(r.calls.length,0);
 r.user.permissions.owner=true;const d=deferred();r.request=path=>path==='logout'?Promise.resolve({}):d.promise;
 const pending=r.load('a',{route:'stock',force:false});await r.logout();d.resolve({rows:[{id:'late',branch:'a'}]});await pending;assert.equal(r.devices.length,0);assert.equal(r.user,null);assert.equal(r.ready('a','stock'),false);
});
