const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const stylesheet = fs.readFileSync(path.join(__dirname, '..', 'src', 'editor', 'styles', 'imagePreviews.css'), 'utf8');

test('image previews are bounded inline widgets without CodeMirror block layout rules', () => {
  assert.match(stylesheet, /\.cm-image-preview-source\s*\{\s*display: none;\s*\}/s);
  assert.match(stylesheet, /\.cm-image-preview-align-center\s*\{\s*text-align: center;\s*\}/s);
  assert.match(stylesheet, /\.cm-image-preview\s*\{[^}]*display: inline-block;[^}]*max-height: 10rem;[^}]*object-fit: contain;/s);
  assert.doesNotMatch(stylesheet, /\.cm-(?:content|line|scroller|gutters)/);
});
