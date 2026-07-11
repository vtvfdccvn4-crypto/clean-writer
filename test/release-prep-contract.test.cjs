const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('release prep includes browser smoke coverage', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const releasePrep = packageJson.scripts?.['release:prep'] || '';

  assert.match(releasePrep, /\bnpm run test:browser-smoke\b/);
});
