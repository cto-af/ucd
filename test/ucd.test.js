import assert from 'node:assert';
import {parse} from '../lib/ucd.js';
import {test} from 'node:test';
import {testPeggy} from '@peggyjs/coverage';

const parserURL = new URL('../src/ucd.js', import.meta.url);
test('ucd parser', () => {
  const f = parse(`
0000;<control>;Cc;0;BN;;;;;N;NULL;;;;
`);
  assert(f);
  let count = 0;
  for (const _fields of f) {
    count++;
  }
  assert.equal(count, 1);
});

test('ucd parser coverage', async() => {
  const {total, valid, invalid} = await testPeggy(parserURL, [
    {
      validInput: '0000;<control>;Cc;0;BN\n',
      validResult(f) {
        assert.equal(f.entries.length, 1);
      },
      invalidInput: '',
    },
    {
      validInput: `\
# Blocks-15.1.0.txt
# Date: 2023-07-28, 15:47:20 GMT
# © 2023 Unicode®, Inc.
1;
`,
      validResult(f) {
        assert.deepEqual(f.version, [15, 1, 0]);
        assert.deepEqual(f.date, new Date('2023-07-28T15:47:20Z'));
      },
    },
    {
      validInput: `\
# First field:  Code point
# field 2: Alias
# Second field: Alias
# Third field:  Type
# Fourth field:
# Fifth field: A thing_thing to do
1;
`,
      validResult(f) {
        assert.deepEqual(f.fields, [
          {description: 'Code point', word: 'Code'},
          {description: 'Alias', word: 'Alias'},
          {description: 'Type', word: 'Type'},
          {description: '', word: ''},
          {description: 'A thing_thing to do', word: 'thing_thing'},
        ]);
      },
    },
    {
      validInput: `
# Property: foo
# Derived Property: bar (no longer used)
1;
`,
      validResult(f) {
        assert.deepEqual(f.entries, [
          {derived: false, fields: [], property: 'foo'},
          {derived: true, fields: [], property: 'bar', comment: '(no longer used)'},
          {fields: ['1', null]},
        ]);
      },
    },
  ]);
  assert.equal(total, 10);
  assert.equal(valid, 8);
  assert.equal(invalid, 2);
});
