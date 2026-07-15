const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let collectPaginationCss;
let collectPageBoundaries;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24703 } } });
  ({ collectPaginationCss } = await server.ssrLoadModule('/src/boot/export-pagination-frame.ts'));
  ({ collectPageBoundaries } = await server.ssrLoadModule('/src/print/PrintPaginator.ts'));
});

after(async () => server?.close());

test('export pagination serialises only the generated Paged.js stylesheet', () => {
  const root = {
    querySelectorAll: () => [
      { textContent: '.pagedjs_page { width: 210mm; }' },
      { textContent: '.pagedjs_margin-top { height: 20mm; }' }
    ]
  };

  assert.equal(
    collectPaginationCss(root),
    '.pagedjs_page { width: 210mm; }\n.pagedjs_margin-top { height: 20mm; }'
  );
});

test('pagination reports source anchors at physical page boundaries', () => {
  const page = anchor => ({
    querySelector: () => anchor ? { getAttribute: name => name === 'data-ref' ? anchor : null } : null
  });
  const root = {
    querySelectorAll: () => [page('first'), page('second'), page(null), page('fourth')]
  };

  assert.deepEqual(collectPageBoundaries(root), [
    { pageNumber: 2, anchor: 'second' },
    { pageNumber: 4, anchor: 'fourth' }
  ]);
});
