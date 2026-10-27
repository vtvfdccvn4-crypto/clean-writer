const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let outlineSectionHtml;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24697 } } });
  ({ outlineSectionHtml } = await server.ssrLoadModule('/src/ui/outline-view.ts'));
});

after(async () => server?.close());

test('section markup is made of buttons that carry their path, line and action', () => {
  const html = outlineSectionHtml('chapters/one.md', 'one.md', [
    { level: 1, text: 'Opening', line: 3 },
    { level: 2, text: 'Detail', line: 9 }
  ]);
  assert.match(html, /<button type="button" class="document-outline-section-name" data-outline-item data-action="section" data-key="section:chapters\/one\.md" data-path="chapters\/one\.md">one\.md<\/button>/);
  assert.match(html, /data-action="heading" data-key="heading:chapters\/one\.md:Opening\u00010" data-path="chapters\/one\.md" data-line="3" style="padding-left: 12px">Opening<\/button>/);
  assert.match(html, /data-line="9" style="padding-left: 24px">Detail<\/button>/);
});

test('heading text and paths are escaped, and an empty heading gets a readable label', () => {
  const html = outlineSectionHtml('a"b.md', '<img src=x>', [{ level: 1, text: '<script>x</script>', line: 1 }, { level: 1, text: '', line: 2 }]);
  assert.doesNotMatch(html, /<script>|<img src=x>/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /\(empty heading\)/);
  assert.match(html, /data-path="a&quot;b\.md"/);
});

test('a repeated heading gets its own identity, and a moved heading keeps its identity', () => {
  const first = outlineSectionHtml('a.md', 'a.md', [{ level: 1, text: 'Notes', line: 1 }, { level: 1, text: 'Notes', line: 5 }]);
  const moved = outlineSectionHtml('a.md', 'a.md', [{ level: 1, text: 'Notes', line: 1 }, { level: 1, text: 'Notes', line: 7 }]);
  const keys = html => [...html.matchAll(/data-key="([^"]+)"/g)].map(match => match[1]).filter(key => key.startsWith('heading:'));
  assert.equal(new Set(keys(first)).size, 2, 'the two Notes headings need distinct keys');
  assert.deepEqual(keys(first), keys(moved), 'moving a heading must not change its key');
});
