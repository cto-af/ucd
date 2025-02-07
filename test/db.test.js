import {after, test} from 'node:test';
import {Database} from '../lib/db.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

const DIR = await fs.mkdtemp(join(tmpdir(), 'ucd-db-'));

after(async() => {
  await fs.rm(DIR, {
    recursive: true,
  });
});

function rmLU(f) {
  const {lastUpdate, ...rest} = f;
  return rest;
}
test('in-memory', async() => {
  const db = new Database();
  assert.ok(db);
  assert.ok(!db.isValid);
  assert.equal(db.lastUpdate.constructor.name, 'Date');
  assert.equal(db.length, 0);

  const date = new Date().toUTCString();
  const f = {
    date,
    version: '1.0.0',
    etag: 'bah',
  };
  await db.setFile('boo', f);
  assert.ok(db.isValid);
  assert.equal(db.length, 1);
  assert.deepEqual(rmLU(db.getFile('boo')), f);
  await db.setFile('boo', f);
  assert.deepEqual(rmLU(db.getFile('boo')), f);
  f.version = '1.0.1';
  await db.setFile('boo', f);
  assert.deepEqual(rmLU(db.getFile('boo')), f);
  f.date = new Date(0);
  await db.setFile('boo', f);
  assert.deepEqual(rmLU(db.getFile('boo')), f);
  f.etag = 'newEtag';
  await db.setFile('boo', f);
  assert.deepEqual(rmLU(db.getFile('boo')), f);
  await db.setFile('boo', f);
  assert.deepEqual(rmLU(db.getFile('boo')), f);
});

test('tempdir', async() => {
  const f = join(DIR, 'foo.json');

  // Try to read a dir as a file
  await fs.mkdir(join(DIR, 'bad'));
  await assert.rejects(() => new Database(join(DIR, 'bad')).init());

  const db = await Database.create(f);
  assert.ok(db);

  const date = String(new Date());
  const file = {
    date,
    version: '1.0.0',
    etag: 'bah',
  };
  await db.setFile('foo', file);
  assert.deepEqual(rmLU(db.getFile('foo')), file);

  const db2 = await Database.create(f);
  assert.deepEqual(rmLU(db2.getFile('foo')), file);
});
