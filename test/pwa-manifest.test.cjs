const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('PWA manifest launches within the deployment directory scope', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.webmanifest'), 'utf8'));

  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.icons.some(icon => icon.type === 'image/png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.type === 'image/png' && icon.sizes === '512x512' && icon.purpose.includes('maskable')));
  assert.ok(manifest.icons.some(icon => icon.type === 'image/svg+xml' && icon.sizes === 'any'));
});

test('service-worker registration resolves the relative deployment base against the document', () => {
  const registration = fs.readFileSync(path.join(__dirname, '..', 'src', 'sw-registration.ts'), 'utf8');

  assert.match(registration, /new URL\(import\.meta\.env\.BASE_URL, window\.location\.href\)/);
  assert.match(registration, /new URL\('sw\.js', baseUrl\)/);
  assert.doesNotMatch(registration, /new URL\('sw\.js', import\.meta\.env\.BASE_URL\)/);
});
