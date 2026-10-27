const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

// Output hashes recorded from the compiler before the raw-HTML pass was made conditional.
// A change to the compiler must leave every hash the same, or be a deliberate, recorded change.
const GOLDEN = {
  "corpus1000": {
    "html": "ce765c1d8eec38abec2c15d0beb6e877111b2f6dede2c2ae6c1d311e8c9a2a0d",
    "manifest": "b30a28c1baf408435847606f7c7af0a23f30b7efae98539277bb0e366104fe2f"
  },
  "features": {
    "html": "6fd47bb94c2e1d3440c6a9b72511296dc2144a85b097ba3e076d742123e62e94",
    "manifest": "586f5429183db042391807cd2d2513648c2767b38ceb5caef9825e487de2db92"
  },
  "mixedWithRawHtml": {
    "html": "d6b2f02f089ba09e2b82fb8dd5c565a895797967ce373d6e33f56fcccaaead64",
    "manifest": "9a96c53e93a976489e0b4d2144eeb76d1754b176d2521091da5d6b60d0d87720"
  }
};

let server;
let compilePreviewDocument;
let documentCompileSettings;
let DEFAULT_APP_STATE;

before(async () => {
  server = await createTestServer();
  ({ compilePreviewDocument, documentCompileSettings } = await server.ssrLoadModule('/src/compiler/index.ts'));
  ({ DEFAULT_APP_STATE } = await server.ssrLoadModule('/src/config/defaults.ts'));
});

after(async () => server?.close());

const page = index => [
  `## Section ${index}`, '',
  'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit, sed do _eiusmod_ tempor incididunt ut labore. '.repeat(12), '',
  '- first item with `code`', '- second item {{tagged}}', '',
  'Second paragraph with a [link](https://example.com) and more prose to fill the page. '.repeat(10),
  ...(index % 10 === 0 ? ['', '![pic](images/b.png)', '', '| a | b | c |', '|---|---|---|', '| 1 | 2 | 3 |'] : []), ''
].join('\n');

const FEATURES = `# Features

Text with ~~struck~~ and a footnote[^1], a bare https://example.com/auto link, and [a reference][ref].

- [x] done task
- [ ] open task

> A quotation with **bold** and _italic_.

1. first
2. second

| left | right |
|:-----|------:|
| 1    | 2     |

:::toc

## Second heading

![pic](images/a.png)

[ref]: https://example.com/ref
[^1]: Note body.
`;

const MIXED = `# Mixed

A {{styled}} paragraph with a [reference][r] and a note[^n].

<div class="note">raw <b>html</b><script>alert(1)</script></div>

[r]: https://example.com/ref
[^n]: Footnote body.
`;

const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const SETTINGS = () => documentCompileSettings({
  ...DEFAULT_APP_STATE,
  customStyles: [{ id: 'red', name: 'Red', openingPair: '{{', closingPair: '}}', color: '#ff0000', isBold: true, isItalic: false, fontFamily: '', fontSize: 0 }]
});
const resolver = { async preloadImages() {}, resolveSync: path => `asset://${path}`, releaseAll() {} };

async function hashesFor(markdown) {
  const compiled = await compilePreviewDocument(markdown, resolver, SETTINGS(), { sourceLineOffset: 0 });
  return { html: digest(compiled.html), manifest: digest(JSON.stringify(compiled.manifest)) };
}

test('the compiler output is unchanged for the golden documents', async () => {
  const corpus = Array.from({ length: 1000 }, (_, i) => page(i + 1)).join('\n');
  const actual = {
    corpus1000: await hashesFor(corpus),
    features: await hashesFor(FEATURES),
    mixedWithRawHtml: await hashesFor(MIXED)
  };
  assert.deepEqual(actual, GOLDEN);
});
