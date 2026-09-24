import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLinkIdentification} from '../public/link-page.js';
test('link identification preserves numeric zeros and requires allowed prefix',()=>{
 assert.equal(normalizeLinkIdentification(' grs - 021 '),'GRS - 021');
 assert.equal(normalizeLinkIdentification('XRS12'),'XRS - 12');
 for(const input of ['ABC1234','024800001','GRS','AAA1234567','GRS - <21>'])assert.throws(()=>normalizeLinkIdentification(input));
});
