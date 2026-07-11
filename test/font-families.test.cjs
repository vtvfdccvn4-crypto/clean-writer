const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let FONT_FAMILY_OPTIONS;
let renderFontFamilyOptions;
let resolveFontFamily;

before(async () => {
  server = await createTestServer();
  ({
    FONT_FAMILY_OPTIONS,
    renderFontFamilyOptions,
    resolveFontFamily
  } = await server.ssrLoadModule('/src/config/font-families.ts'));
});

after(async () => {
  await server?.close();
});

test('font families are defined from one canonical list', () => {
  const values = FONT_FAMILY_OPTIONS.map(option => option.value);

  assert.deepEqual(values, [
    'Calibri',
    'Segoe UI',
    'Arial',
    'Times New Roman',
    'Cambria',
    'Candara',
    'Constantia',
    'Corbel',
    'Georgia',
    'Tahoma',
    'Trebuchet MS',
    'Verdana',
    'Consolas',
    'Courier New'
  ]);
  assert.equal(new Set(values).size, values.length);
  assert.match(renderFontFamilyOptions(), /Calibri/);
  assert.match(renderFontFamilyOptions(), /Times New Roman/);
  assert.doesNotMatch(renderFontFamilyOptions(), /Inter/);
  assert.doesNotMatch(renderFontFamilyOptions(), /Google Sans Code/);
  assert.equal(resolveFontFamily('Arial', 'Calibri'), 'Arial');
  assert.equal(resolveFontFamily('Inter', 'Calibri'), 'Calibri');
});
