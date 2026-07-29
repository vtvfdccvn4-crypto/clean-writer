const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const fixturePath = path.join(__dirname, 'fixtures', 'browser-authoring-smoke.ts');

test('browser authoring fixture covers current isolated-preview reliability checks', () => {
  const source = fs.readFileSync(fixturePath, 'utf-8');

  [
    'projectSession.createSection',
    'setFullDocMode',
    'isolated-full-document',
    'isolated page-setup rerender',
    'pageSetupUsedIsolatedPipeline',
    'sourceNavigationAvailable',
    'previewCleanAfterClose'
  ].forEach(marker => {
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `Expected authoring fixture marker ${marker}`);
  });
});
