const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compiler;
let defaults;
let state;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24721 } } });
  compiler = await server.ssrLoadModule('/src/compiler/index.ts');
  ({ DEFAULT_APP_STATE: defaults } = await server.ssrLoadModule('/src/config/defaults.ts'));
  ({ state } = await server.ssrLoadModule('/src/state.ts'));
});

after(async () => server?.close());

const highlight = {
  id: 'highlight',
  name: 'Highlight',
  openingPair: '==',
  closingPair: '==',
  fontFamily: '',
  fontSize: 0,
  color: '#aa0000',
  isBold: true,
  isItalic: false
};

test('compile output follows the settings passed in, not global app state', async () => {
  const styled = compiler.documentCompileSettings({ ...defaults, customStyles: [highlight] });
  const plain = compiler.documentCompileSettings(defaults);

  assert.match(await compiler.compileMarkdown('a ==marked== word', null, styled), /class="custom-style"/);
  assert.doesNotMatch(await compiler.compileMarkdown('a ==marked== word', null, plain), /class="custom-style"/);
  // Global state never had the style, so it cannot be the source of either result.
  assert.equal(state.current.customStyles.some(style => style.id === 'highlight'), false);
});

test('compile settings compare equal when nothing changed, including missing lists', () => {
  const withoutSpecialHeadings = { ...defaults, pageSetup: { ...defaults.pageSetup, specialHeadings: undefined } };
  const first = compiler.documentCompileSettings(withoutSpecialHeadings);
  const second = compiler.documentCompileSettings(withoutSpecialHeadings);

  assert.notEqual(first, second);
  assert.equal(compiler.sameDocumentCompileSettings(first, second), true);
});

test('compile settings differ when any compile-relevant setting changes', () => {
  const base = compiler.documentCompileSettings(defaults);
  const changes = [
    { customStyles: [highlight] },
    { customBlockStyles: [] },
    { projectMetadata: { ...defaults.projectMetadata } },
    { pageSetup: { ...defaults.pageSetup, specialHeadings: [] } },
    { typographySetup: { ...defaults.typographySetup, paragraph: { ...defaults.typographySetup.paragraph } } }
  ];
  for (const change of changes) {
    const next = compiler.documentCompileSettings({ ...defaults, ...change });
    assert.equal(compiler.sameDocumentCompileSettings(base, next), false, `${Object.keys(change)[0]} change was not detected`);
  }
});
