import {after, before, test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Buffer} from 'node:buffer';
import {UCD} from '../lib/index.js';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import {hostLocal} from 'hostlocal';
import {join} from 'node:path';
import {once} from 'node:events';
import tls from 'node:tls';
import {tmpdir} from 'node:os';

const root = fileURLToPath(new URL('../tools/ucd', import.meta.url));
const server = await hostLocal(root, {
  port: 0,
  open: false,
  prefix: 'ucd',
  logLevel: 2,
  temp: true,
});
const prefix = await server.start();
const cacheDir = await fs.mkdtemp(join(tmpdir(), 'ucd-index-'));
before(t => {
  const origCsC = tls.createSecureContext;
  t.mock.method(tls, 'createSecureContext', options => {
    const secureContext = origCsC(options);
    secureContext.context.addCACert(server.caCert);
    return secureContext;
  });
});
after(async t => {
  const closer = once(server, 'close');
  server.close();
  await closer;
  t.mock.reset();
  await fs.rm(cacheDir, {recursive: true});
});

test('create', async () => {
  await assert.doesNotReject(() => UCD.create());
  await assert.doesNotReject(() => UCD.create({
    cacheDir: null, verbose: true,
  }));
  const cd = await UCD.create({
    cacheDir: join(cacheDir, 'TEMP', 'DEEP'),
  });
  await cd.rmDir();

  await assert.rejects(() => UCD.create({cacheDir: 0}));
  await assert.rejects(() => UCD.create({
    cacheDir: new URL(import.meta.url),
  }));
});

test('version', async () => {
  const cd = await UCD.create({
    cacheDir,
    prefix,
  });
  const ver = await cd.fetchUCDversion({CI: false});
  delete ver.lastModified;
  delete ver.etag;

  assert.deepEqual(ver, {
    version: '15.1.0',
    date: new Date('2023-08-28'),
  });

  const badCd = await UCD.create({
    cacheDir: join(cacheDir, 'BAD'),
    prefix: `${prefix}BAD_DIR/`,
  });

  await assert.rejects(() => badCd.fetchUCDversion({CI: true}));
  await assert.rejects(() => badCd.fetchUCDversion({CI: false}));

  const invalidCd = await UCD.create({
    cacheDir: join(cacheDir, 'BAD'),
    prefix: `${prefix}bad/`,
  });
  await assert.rejects(() => invalidCd.fetchUCDversion({CI: false}));
});

test('Buffer cacheDir', async () => {
  const cd = await UCD.create({
    cacheDir: Buffer.from(cacheDir),
    prefix,
  });
  assert(cd);
});

test('NormalizationCorrections', async () => {
  const cd = await UCD.create({
    cacheDir: pathToFileURL(cacheDir),
    prefix,
  });
  assert(cd);
  const res = await cd.parse('NormalizationCorrections.txt', {CI: false});
  assert(res);
  const res2 = await cd.parse('NormalizationCorrections.txt', {
    lastModified: res.lastModified,
    etag: res.etag,
    CI: false,
  });
  assert.equal(res2.status, 304);
  const res3 = await cd.parse('NormalizationCorrections.txt', {
    CI: true,
  });
  assert.equal(res3.status, 304);
});

test('alwaysParse', async () => {
  const cd = await UCD.create({
    cacheDir: pathToFileURL(cacheDir),
    prefix,
    alwaysParse: true,
  });
  const res = await cd.parse('NormalizationCorrections.txt', {
    CI: true,
  });
  assert.equal(res.status, 200);
  assert(res.parsed);
});

test('creates directory', async () => {
  const cd = await UCD.create({
    cacheDir: pathToFileURL(cacheDir),
    prefix,
  });
  const res = await cd.parse('emoji/emoji-data.txt', {
    CI: false,
  });
  assert.equal(res.status, 200);
  assert(res.parsed);
});
