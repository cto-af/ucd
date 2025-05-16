import {after, before, test} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Buffer} from 'node:buffer';
import {CacheDir} from '../lib/index.js';
import assert from 'node:assert';
import {createCA} from '@cto.af/ca';
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
  logLevel: -2,
});
const prefix = (await new Promise((resolve, reject) => {
  server.on('error', reject);
  server.on('listen', resolve);
  server.start();
})).toString();

const cacheDir = await fs.mkdtemp(join(tmpdir(), 'ucd-index-'));

before(async t => {
  // Trust our own CA.
  const {cert} = await createCA({noKey: true});
  const origCsC = tls.createSecureContext;
  t.mock.method(tls, 'createSecureContext', options => {
    const res = origCsC(options);
    res.context.addCACert(cert);
    return res;
  });
});
after(async t => {
  const closer = once(server, 'close');
  server.close();
  await closer;
  t.mock.reset();
  await fs.rm(cacheDir, {recursive: true});
});

test('create', async() => {
  await assert.doesNotReject(() => CacheDir.create());
  await assert.doesNotReject(() => CacheDir.create({
    cacheDir: null, verbose: true,
  }));
  const cd = await CacheDir.create({
    cacheDir: join(cacheDir, 'TEMP', 'DEEP'),
  });
  await cd.rmDir();

  await assert.rejects(() => CacheDir.create({cacheDir: 0}));
  await assert.rejects(() => CacheDir.create({
    cacheDir: new URL(import.meta.url),
  }));
});

test('version', async() => {
  const cd = await CacheDir.create({
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

  const badCd = await CacheDir.create({
    cacheDir: join(cacheDir, 'BAD'),
    prefix: `${prefix}BAD_DIR/`,
  });

  await assert.rejects(() => badCd.fetchUCDversion({CI: true}));
  await assert.rejects(() => badCd.fetchUCDversion({CI: false}));

  const invalidCd = await CacheDir.create({
    cacheDir: join(cacheDir, 'BAD'),
    prefix: `${prefix}bad/`,
  });
  await assert.rejects(() => invalidCd.fetchUCDversion());
});

test('Buffer cacheDir', async() => {
  const cd = await CacheDir.create({
    cacheDir: Buffer.from(cacheDir),
    prefix,
  });
  assert(cd);
});

test('NormalizationCorrections', async() => {
  const cd = await CacheDir.create({
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
