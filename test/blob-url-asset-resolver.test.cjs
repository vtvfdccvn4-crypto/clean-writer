const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let BlobUrlAssetResolver;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24689 } } });
  ({ BlobUrlAssetResolver } = await server.ssrLoadModule('/src/platform/BlobUrlAssetResolver.ts'));
});

after(async () => server?.close());

test('asset preloading deduplicates paths and runs independent reads concurrently', async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  let active = 0;
  let maxActive = 0;
  const reads = [];
  URL.createObjectURL = blob => `blob:${blob.size}:${reads.length}`;
  URL.revokeObjectURL = url => revoked.push(url);
  try {
    const resolver = new BlobUrlAssetResolver(async path => {
      reads.push(path);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return new Blob([path]);
    });

    await Promise.all([
      resolver.preloadImages(['images/a.png', 'images/a.png', 'images/b.png']),
      resolver.preloadImages(['images/a.png'])
    ]);

    assert.equal(new Set(reads).size, 2);
    assert.equal(maxActive, 2);
    assert.match(resolver.resolveSync('images/a.png'), /^blob:/);
    resolver.releaseAll();
    assert.equal(revoked.length, 2);
    assert.equal(resolver.resolveSync('images/a.png'), 'images/a.png');
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
