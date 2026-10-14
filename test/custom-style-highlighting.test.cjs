const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let customBlockEditorLineAttributes;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24727 } } });
  ({ customBlockEditorLineAttributes } = await server.ssrLoadModule('/src/editor/extensions/customBlockEditorPresentation.ts'));
});

after(async () => server?.close());

test('custom quote editor lines use leading spacing without adding bottom padding', () => {
  const attributes = customBlockEditorLineAttributes({
    id: 'quotation',
    name: 'Quotation',
    prefix: '>>',
    icon: '“',
    fontFamily: 'Georgia',
    fontSize: 12,
    color: '#334455',
    isBold: false,
    isItalic: true,
    lineHeight: 1.4,
    marginTop: 7,
    marginBottom: 11
  });

  assert.equal(attributes.class, 'cm-custom-block-line');
  assert.match(attributes.style, /--cw-custom-block-space-before: 7pt/);
  assert.doesNotMatch(attributes.style, /space-after|padding-(?:bottom|block-end)/);
  assert.doesNotMatch(attributes.style, /margin-(?:top|bottom)/);
  assert.doesNotMatch(attributes.style, /font-size/);
});

test('custom quote editor lines inherit the font size selected in editor settings', () => {
  const attributes = customBlockEditorLineAttributes({
    id: 'quotation', name: 'Quotation', prefix: '>>', icon: '', fontFamily: 'Georgia', fontSize: 72,
    color: '#334455', isBold: false, isItalic: false, marginTop: 0, marginBottom: 0
  });

  assert.doesNotMatch(attributes.style, /font-size/);
});

test('custom quote editor leading spacing is bounded before it reaches layout', () => {
  const attributes = customBlockEditorLineAttributes({
    id: 'bounded', name: 'Bounded', prefix: '!', icon: '', fontFamily: '', fontSize: 0,
    isBold: false, isItalic: false, marginTop: -20, marginBottom: 900
  });

  assert.match(attributes.style, /--cw-custom-block-space-before: 0pt/);
  assert.doesNotMatch(attributes.style, /space-after/);
});
