const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('service worker prunes stale hashed assets while preserving referenced assets', () => {
  const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');

  assert.match(serviceWorker, /function pruneStaleAssets\(\)/);
  assert.match(serviceWorker, /new URL\('assets\/', self\.registration\.scope\)\.pathname/);
  assert.match(serviceWorker, /function isScopedAsset\(url\)/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\(ASSET_ROOT_PATH\)/);
  assert.match(serviceWorker, /!keep\.has\(url\.pathname\)/);
  assert.match(serviceWorker, /pruneStaleAssets\(\)/);
});
