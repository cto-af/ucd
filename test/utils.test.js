import assert from 'node:assert';
import {isCI} from '../lib/utils.js';
import test from 'node:test';

test('isCI', () => {
  const CI = isCI();
  assert.equal(typeof CI, 'boolean');

  assert.equal(isCI({CI: true}), true);
  assert.equal(isCI({CI: false}), false);
  assert.equal(isCI({}), CI);

  const {env} = process;
  process.env = {};
  assert.equal(isCI(), false);
  process.env = env;
});
