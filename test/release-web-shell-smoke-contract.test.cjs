const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');

test('production web shell smoke script is part of the release gate', () => {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(packageJson.scripts['test:pwa-smoke'], /release-web-shell-smoke\.mjs/);
  assert.match(packageJson.scripts['release:prep'], /npm run test:pwa-smoke/);
});
