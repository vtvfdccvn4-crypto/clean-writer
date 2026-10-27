const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileMarkdown;
let settings;

before(async () => {
  server = await createTestServer();
  const compiler = await server.ssrLoadModule('/src/compiler/index.ts');
  const { DEFAULT_APP_STATE } = await server.ssrLoadModule('/src/config/defaults.ts');
  compileMarkdown = compiler.compileMarkdown;
  settings = compiler.documentCompileSettings(DEFAULT_APP_STATE);
});

after(async () => server?.close());

const anchorFor = (html, href) => {
  const match = html.match(new RegExp(`<a[^>]*href="${href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*>`));
  return match ? match[0] : null;
};

test('web links open in a new context without access to the app', async () => {
  const html = await compileMarkdown('[Site](https://example.com/page) and [Plain](http://example.org)', null, settings);
  for (const href of ['https://example.com/page', 'http://example.org']) {
    const anchor = anchorFor(html, href);
    assert.ok(anchor, `missing link to ${href}`);
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noopener noreferrer"/);
  }
});

test('in-document and relative links are left alone', async () => {
  const html = await compileMarkdown('[Jump](#chapter-one) and [Note](notes/other.md)', null, settings);
  for (const href of ['#chapter-one', 'notes/other.md']) {
    const anchor = anchorFor(html, href);
    assert.ok(anchor, `missing link to ${href}`);
    assert.doesNotMatch(anchor, /target=/);
    assert.doesNotMatch(anchor, /rel=/);
  }
});
