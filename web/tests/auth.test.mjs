import test from 'node:test';
import assert from 'node:assert/strict';
import {passwordHash,passwordMatches,hash} from '../backend/auth.mjs';
test('password verifier preserves whitespace and rejects incorrect passwords',()=>{
 const value=passwordHash(' secure password ');
 assert.ok(passwordMatches(' secure password ',value));
 assert.equal(passwordMatches('secure password',value),false);
 assert.equal(passwordMatches('other',value),false);
 assert.equal(passwordMatches('other','invalid'),false);
});
test('desktop verifier accepts the existing password without retaining plaintext',()=>{
 const salt='test-only-salt',password='test-only-password';
 const legacy='legacy-sha256:'+salt+':'+hash(salt+':'+password);
 assert.ok(passwordMatches(password,legacy));
 assert.equal(passwordMatches('wrong',legacy),false);
 assert.ok(passwordMatches(password,passwordHash(password)));
});
