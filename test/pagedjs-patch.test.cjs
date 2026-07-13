const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

test('Pinned Paged.js patch validates the installed helper functions', () => {
  const script = path.join(__dirname, '..', 'scripts', 'verify-pagedjs-patch.mjs');
  const output = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(output, /Paged\.js 0\.4\.3 patch verified/);
});
