import assert from 'node:assert';
import {isCI} from '../lib/utils.js';
import test from 'node:test';

test('isCI', () => {
  const CI = isCI();
  assert.equal(typeof CI, 'boolean');
});
