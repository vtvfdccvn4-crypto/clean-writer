const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

test('Paged.js null-guard patch validates the installed helper functions', () => {
  const script = path.join(__dirname, '..', 'patch-pagedjs.js');
  const output = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(output, /Paged\.js null guards ready/);
});
