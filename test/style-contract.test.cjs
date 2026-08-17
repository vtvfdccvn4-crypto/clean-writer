const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('shared button variants remain defined in one foundation', () => {
  const css = read('src/ui/styles/buttons.css');
  for (const variant of ['.ui-button--icon', '.ui-button--text', '.ui-button--icon-text', '.ui-button--block']) {
    assert.match(css, new RegExp(`${variant.replace(/[.-]/g, '\\$&')}\\s*\\{`));
  }
});

test('workspace breakpoints do not redefine the base grid', () => {
  const css = read('src/ui/styles/workspace.css');
  assert.doesNotMatch(css, /@media[\s\S]*?\.workspace\s*\{[\s\S]*?grid-template-(?:columns|rows|areas)/);
  assert.match(css, /grid-template-columns:\s*50px var\(--task-panel-width\)/);
});

test('preview feature generators retain separate live and paginated options', () => {
  const source = read('src/preview/css/document-features-css.ts');
  assert.match(source, /includePageBreaks/);
  assert.match(source, /includePageCounters/);
});
