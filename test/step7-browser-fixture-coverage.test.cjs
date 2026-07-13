const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const fixturePath = path.join(__dirname, 'fixtures', 'browser-authoring-smoke.ts');

test('browser authoring fixture retains Step 7 editor reliability checks', () => {
  const source = fs.readFileSync(fixturePath, 'utf-8');

  [
    'autosaveCompleted',
    'undoAfterAutosave',
    'viewStateRestored',
    'searchPanelOpened',
    'recoveryConfirmShown',
    'draftRestored',
    'fileDropNoticeSeen',
    'longTextAutosaved',
    'longTextPreserved',
    'longTextCursorRestored'
  ].forEach(marker => {
    assert.match(source, new RegExp(`\\b${marker}\\b`), `Expected Step 7 fixture marker ${marker}`);
  });
});
