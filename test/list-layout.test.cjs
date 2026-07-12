const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileMarkdown;
let generateListCss;

const listStyle = (overrides = {}) => ({
  fontFamily: 'Arial',
  fontSize: 11,
  color: '#111111',
  isBold: false,
  isItalic: false,
  lineHeight: 1.6,
  bulletIcon: '•',
  bulletColor: '#222222',
  marginLeft: 20,
  paddingLeft: 8,
  ...overrides
});

const listSetup = (overrides = {}) => ({
  ulAsterisk: listStyle(),
  ulDash: listStyle({ bulletIcon: '-' }),
  ulPlus: listStyle({ bulletIcon: '+' }),
  ol: listStyle({ bulletIcon: 'decimal' }),
  olParen: listStyle({ bulletIcon: 'decimal' }),
  ...overrides
});

before(async () => {
  server = await createTestServer();
  ({ compileMarkdown } = await server.ssrLoadModule('/src/compiler/index.ts'));
  ({ generateListCss } = await server.ssrLoadModule('/src/preview/CssGenerator.ts'));
});

after(async () => {
  await server?.close();
});

test('unordered list items compile into marker and content columns', async () => {
  const html = await compileMarkdown('* Parent\n  - Nested\n* Sibling');

  assert.match(html, /<ul data-marker="asterisk"(?: [^>]*)?>/);
  assert.match(html, /<span class="document-list-marker" aria-hidden="true"><\/span>/);
  assert.match(html, /<div class="document-list-content">Parent/);
  assert.match(html, /<ul data-marker="dash">/);
  assert.equal((html.match(/class="document-list-marker"/g) || []).length, 3);
  assert.equal((html.match(/class="document-list-content"/g) || []).length, 3);
});

test('ordered list delimiters compile into independent marker classes', async () => {
  const html = await compileMarkdown('1. Period\n2. Period two\n\n1) Parenthesis\n2) Parenthesis two');

  assert.match(html, /<ol data-marker="period"(?: [^>]*)?>/);
  assert.match(html, /<ol data-marker="paren"(?: [^>]*)?>/);
  assert.equal((html.match(/class="document-list-marker"/g) || []).length, 4);
  assert.match(html, /<div class="document-list-content">Period/);
  assert.match(html, /<div class="document-list-content">Parenthesis/);
});

test('unordered list CSS keeps the marker in flow with an exact configured gap', () => {
  const setup = listSetup({ ulAsterisk: listStyle({ marginLeft: 14, paddingLeft: 6 }) });
  const css = generateListCss(setup);

  assert.match(css, /padding-inline-start: 14pt !important/);
  assert.match(css, /grid-template-columns: max-content minmax\(0, 1fr\)/);
  assert.match(css, /column-gap: 6pt/);
  assert.match(css, /ul\[data-marker="asterisk"\] > li > \.document-list-marker/);
  assert.doesNotMatch(css, /position:\s*absolute/);
  assert.doesNotMatch(css, /translateX/);
});

test('ordered list classes keep independent counter styles and spacing', () => {
  const setup = listSetup({
    ol: listStyle({ bulletIcon: 'upper-roman', marginLeft: 18, paddingLeft: 5 }),
    olParen: listStyle({ bulletIcon: 'lower-alpha', marginLeft: 24, paddingLeft: 9 })
  });
  const css = generateListCss(setup);

  assert.match(css, /ol\[data-marker="period"\] \{[\s\S]*?padding-inline-start: 18pt/);
  assert.match(css, /ol\[data-marker="period"\] > li \{[\s\S]*?column-gap: 5pt/);
  assert.match(css, /ol\[data-marker="period"\] > li > \.document-list-marker::before \{[\s\S]*?upper-roman\) "\."/);
  assert.match(css, /ol\[data-marker="paren"\] \{[\s\S]*?padding-inline-start: 24pt/);
  assert.match(css, /ol\[data-marker="paren"\] > li \{[\s\S]*?column-gap: 9pt/);
  assert.match(css, /ol\[data-marker="paren"\] > li > \.document-list-marker::before \{[\s\S]*?lower-alpha\) "\)"/);
  assert.doesNotMatch(css, /list-style-position:\s*outside/);
});

test('list CSS applies independently configured line heights', () => {
  const setup = listSetup({
    ulAsterisk: listStyle({ lineHeight: 1.25 }),
    ol: listStyle({ lineHeight: 1.8 })
  });
  const css = generateListCss(setup);

  assert.match(css, /ul\[data-marker="asterisk"\] > li \{[\s\S]*?line-height: 1\.25 !important/);
  assert.match(css, /ol\[data-marker="period"\] > li \{[\s\S]*?line-height: 1\.8 !important/);
});

test('list geometry is clamped and marker content is safely escaped', () => {
  const setup = listSetup({
    ulAsterisk: listStyle({ marginLeft: -10, paddingLeft: 500, bulletIcon: '"\\' })
  });
  const css = generateListCss(setup);

  assert.match(css, /padding-inline-start: 0pt !important/);
  assert.match(css, /column-gap: 100pt/);
  assert.match(css, /content: "\\"\\\\"/);
});
