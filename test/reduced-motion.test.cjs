const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const base = fs.readFileSync(path.join(__dirname, '..', 'src/ui/styles/base.css'), 'utf8');

test('the base stylesheet ends transitions and animations for reduced motion', () => {
  const block = base.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
  assert.ok(block, 'missing reduced-motion media query');
  assert.match(block[1], /transition-duration: 0\.01ms !important/);
  assert.match(block[1], /animation-duration: 0\.01ms !important/);
  assert.match(block[1], /scroll-behavior: auto !important/);
});
