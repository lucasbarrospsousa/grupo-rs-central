import test from 'node:test';import assert from 'node:assert/strict';
import {savedStockWatch} from '../public/saved-stock-watch.js';
test('saved page polling is bounded, visibility-aware, change-only and stops',async()=>{
 let callback,delay,reads=0,renders=0,visible=true,delta=false,cancelled=false;
 const close=savedStockWatch({schedule:(fn,ms)=>{callback=fn;delay=ms;return 1;},cancel:()=>{cancelled=true;},active:()=>visible,read:async()=>{reads++;return delta;},changed:()=>renders++});
 assert.equal(delay,10000);await callback();assert.equal(reads,1);assert.equal(renders,0);
 delta=true;await callback();assert.equal(renders,1);
 visible=false;await callback();assert.equal(reads,2);
 close();await callback();assert.equal(reads,2);assert.equal(cancelled,true);
});
test('failure retains old view and concurrent ticks do not duplicate reads',async()=>{
 let callback,resolve,reads=0,renders=0;
 const close=savedStockWatch({schedule:fn=>(callback=fn,1),cancel:()=>{},active:()=>true,read:()=>{reads++;return new Promise(r=>resolve=r);},changed:()=>renders++});
 const first=callback();await callback();assert.equal(reads,1);close();resolve(true);await first;assert.equal(renders,0);
 let attempts=0;
 const stop=savedStockWatch({schedule:fn=>(callback=fn,1),cancel:()=>{},active:()=>true,read:async()=>{attempts++;throw Error('offline');},changed:()=>renders++});
 await callback();await callback();assert.equal(attempts,2);assert.equal(renders,0);stop();
});
