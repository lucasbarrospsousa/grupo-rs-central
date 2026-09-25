import test from 'node:test';import assert from 'node:assert/strict';
import {session,hash} from '../backend/auth.mjs';
import {isReader,restrictedRoute,IDLE_MS} from '../public/access-control.js';
test('reader restrictions are per branch and exclude mutation pages',()=>{assert.equal(isReader({branches:[{id:'a',role:'reader'}]},'a'),true);assert.equal(isReader({branches:[{id:'a',role:'admin'}]},'a'),false);for(const route of ['link','bulk','settings'])assert.equal(restrictedRoute(route),true);assert.equal(restrictedRoute('stock'),false);assert.equal(IDLE_MS,7200000);});
test('authentication checks idle deadline without extending it for polling',async()=>{let sql;const token='a'.repeat(64);await session({query:async(q,args)=>{sql=q;assert.equal(args[0],hash(token));return{rows:[]};}},{headers:{cookie:'central_session='+token}});assert.match(sql,/last_activity_at>now\(\)-interval '2 hours'/);assert.doesNotMatch(sql,/update/i);});
