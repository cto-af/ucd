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

test('ucd parser coverage', async () => {
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
@Part0
# @missing: 0000..10FFFF; Unassigned # comment
1;
`,
      validResult(f) {
        assert.deepEqual(f.entries, [
          {derived: false, fields: [], property: 'foo'},
          {derived: true, fields: [], property: 'bar', comment: '(no longer used)'},
          {
            fields: [{range: [0, 0x10ffff]}, 'Unassigned'],
            missing: true,
            comment: 'comment',
            segment: 'Part0',
          },
          {
            fields: ['1', null],
            segment: 'Part0',
          },
        ]);
      },
    },
    {
      validInput: `
1F250;CIRCLED IDEOGRAPH ADVANTAGE;So;0;L;<circle> 5F97;
`,
      validResult(f) {
        assert.deepEqual(f.entries, [
          {
            fields: [
              {
                points: [
                  127568,
                ],
              },
              'CIRCLED IDEOGRAPH ADVANTAGE',
              'So',
              '0',
              'L',
              {
                points: [
                  24471,
                ],
                prefix: 'circle',
              },
              null,
            ],
          },
        ]);
      },
    },
    {
      invalidInput: '# Blocks-15.1.0.txt\x00',
      options: {
        peg$startRuleFunction: 'peg$parseheader',
      },
    },
    {
      invalidInput: '# Blocks-15',
      options: {
        peg$startRuleFunction: 'peg$parsename',
      },
    },
    {
      invalidInput: '# Property: foo\n# Blocks-15.1.0.txt\x00',
      options: {
        peg$startRuleFunction: 'peg$parseheader',
      },
    },
    {
      invalidInput: '# date: ',
      options: {
        peg$startRuleFunction: 'peg$parsedate',
      },
    },
    {
      invalidInput: '# first foo',
      options: {
        peg$startRuleFunction: 'peg$parsefield_def',
      },
    },
    {
      invalidInput: '# first field',
      options: {
        peg$startRuleFunction: 'peg$parsefield_def',
      },
    },
    {
      invalidInput: '# field 0',
      options: {
        peg$startRuleFunction: 'peg$parsefield_def',
      },
    },
    {
      invalidInput: '<',
      options: {
        peg$startRuleFunction: 'peg$parseword',
      },
    },
    {
      validInput: '#',
      validResult: '',
      invalid: '',
      options: {
        peg$startRuleFunction: 'peg$parsecomment',
      },
    },
    {
      validInput: '#f',
      validResult: 'f',
      invalid: '',
      options: {
        peg$startRuleFunction: 'peg$parsecomment',
      },
    },
    {
      invalidInput: '# Property: <',
      options: {
        peg$startRuleFunction: 'peg$parseentry_derived',
      },
    },
    {
      invalidInput: '# @missing: 0000..10FFFF; XX',
      options: {
        peg$startRuleFunction: 'peg$parseentry_missing',
      },
    },
    {
      invalidInput: '# @missing: ',
      options: {
        peg$startRuleFunction: 'peg$parseentry_missing',
      },
    },
    {
      invalidInput: '@<',
      options: {
        peg$startRuleFunction: 'peg$parseentry_segment',
      },
    },
    {
      invalidInput: '@foo',
      options: {
        peg$startRuleFunction: 'peg$parseentry_segment',
      },
    },
    {
      invalidInput: '1;1;',
      options: {
        peg$startRuleFunction: 'peg$parseentry_fields',
      },
    },
    {
      invalidInput: '',
      options: {
        peg$startRuleFunction: 'peg$parsefields',
      },
    },
    {
      invalidInput: '1;1;',
      options: {
        peg$startRuleFunction: 'peg$parsefields',
        peg$failAfter: {
          peg$parsefield: 0,
        },
      },
    },
    {
      invalidInput: '1;1;',
      options: {
        peg$startRuleFunction: 'peg$parsefields',
        peg$failAfter: {
          peg$parsefield: 1,
        },
      },
    },
    {
      validInput: '0001..0002',
      invalid: '',
      options: {
        peg$startRuleFunction: 'peg$parsefield',
      },
    },
    {
      validInput: '0001--',
      invalid: '',
      options: {
        peg$startRuleFunction: 'peg$parsefield',
      },
    },
    {
      validInput: '0001..zzzz',
      invalid: '',
      options: {
        peg$startRuleFunction: 'peg$parsefield',
      },
    },
    {
      invalidInput: '<foo',
      options: {
        peg$startRuleFunction: 'peg$parsefield_points',
      },
    },
    {
      invalidInput: '<<',
      options: {
        peg$startRuleFunction: 'peg$parsefield_points',
      },
    },
    {
      invalidInput: '0001 zzzz',
      options: {
        peg$startRuleFunction: 'peg$parsefield_points',
      },
    },
    {
      invalidInput: '0001 0002 zzzz',
      options: {
        peg$startRuleFunction: 'peg$parsefield_points',
      },
    },
    {
      validInput: ';\n',
      validResult: null,
      options: {
        peg$startRuleFunction: 'peg$parseCEOL',
      },
    },
    {
      validInput: '',
      validResult: undefined,
      invalid: '',
      options: {
        peg$startRuleFunction: 'peg$parseEOL',
      },
    },
    {
      validInput: '',
      validResult: undefined,
      invalid: '',
      options: {
        peg$startRuleFunction: 'peg$parseEOL',
        peg$silentFails: -1,
      },
    },
  ]);
  assert.equal(total, 41);
  assert.equal(valid, 18);
  assert.equal(invalid, 23);
});
