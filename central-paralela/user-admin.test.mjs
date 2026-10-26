import {test} from 'node:test';import assert from 'node:assert/strict';
import {editUser,publicUser} from './user-admin.mjs';import {passwordMatches} from './auth-crypto.mjs';
const owner={id:'owner',active:true,username:'owner',branches:[{id:'a'}],permissions:{owner:true,views:['overview'],writes:[]}};
const body={username:'reader',password:'test-pass-123',active:true,branches:['a'],views:['stock'],writes:[]};
test('admin creates protected password, edits versioned permissions and preserves owner',()=>{
 const d={users:[structuredClone(owner)]};const u=editUser(d,owner,body);assert.equal(u.password_hash,undefined);assert.equal(passwordMatches(body.password,d.users[1].password_hash),true);
 assert.throws(()=>editUser(d,owner,{...body,id:u.id,version:'old'}),e=>e.status===409);
 const next=editUser(d,owner,{...body,id:u.id,version:u.version,password:'',active:false});assert.equal(next.active,false);
 assert.throws(()=>editUser(d,owner,{...body,id:'owner',version:publicUser(owner).version}),e=>e.status===403);
});
test('non-owner, unknown branches and permission escalation denied',()=>{
 for(const [actor,b] of [[{...owner,permissions:{owner:false}},body],[owner,{...body,branches:['b']}],[owner,{...body,writes:['sms']}]])assert.throws(()=>editUser({users:[]},actor,b));
});
