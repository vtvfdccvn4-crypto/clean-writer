const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

test('package profiling scripts point to files that exist', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const scripts = packageJson.scripts || {};

  const expectedFiles = [
    scripts['profile:preview']?.match(/scripts\/[^\s'"]+/)?.[0],
    scripts['profile:pagination']?.match(/scripts\/[^\s'"]+/)?.[0]
  ].filter(Boolean);

  assert.deepEqual(expectedFiles.sort(), [
    'scripts/profile-pagination.mjs',
    'scripts/profile-preview.mjs'
  ]);

  expectedFiles.forEach(relativeFile => {
    const absoluteFile = path.join(__dirname, '..', relativeFile);
    assert.equal(fs.existsSync(absoluteFile), true, `${relativeFile} should exist`);
  });
});

test('preview server uses the same local origin as the dev server', () => {
  const viteConfig = fs.readFileSync(path.join(__dirname, '..', 'vite.web.config.ts'), 'utf8');

  assert.match(viteConfig, /server:\s*{[\s\S]*port:\s*5274/);
  assert.match(viteConfig, /preview:\s*{[\s\S]*port:\s*5274/);
  assert.match(viteConfig, /preview:\s*{[\s\S]*strictPort:\s*true/);
});
