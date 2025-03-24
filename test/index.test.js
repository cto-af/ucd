import {after, before, test} from 'node:test';
import {CacheDir} from '../lib/index.js';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
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
  const CA = await fs.readFile(
    new URL('../.cert/_CA.cert.pem', import.meta.url),
    'utf8'
  );
  const origCsC = tls.createSecureContext;
  t.mock.method(tls, 'createSecureContext', options => {
    const res = origCsC(options);
    res.context.addCACert(CA);
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

test('version', async() => {
  const cd = await CacheDir.create({
    cacheDir,
    prefix,
  });
  const ver = await cd.fetchUCDversion();

  assert.deepEqual(ver, {
    version: '15.1.0',
    date: new Date('2023-08-28'),
  });
});
