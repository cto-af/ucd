import {test} from 'node:test';
import assert from 'node:assert';
import {parse} from '../lib/ucd.js';

test('ucd parser', () => {
  const f = parse(`
0000;<control>;Cc;0;BN;;;;;N;NULL;;;;
`);
  assert(f);
  let count = 0;
  for (const fields of f) {
    // console.log({fields})
    count++;
  }
  assert.equal(count, 1);
});
