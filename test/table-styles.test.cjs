const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileMarkdown;
let generateTableCss;

const style = (overrides = {}) => ({
  fontFamily: 'Arial', fontSize: 10,
  headerTextColor: '#ffffff', headerBackground: '#445566', headerBold: true,
  bodyTextColor: '#111111', bodyBackground: '#ffffff', alternateRowColor: '#f0f0f0',
  borderColor: '#999999', borderWidth: 1, cellPadding: 6, marginTop: 8, marginBottom: 12,
  ...overrides
});

before(async () => {
  server = await createTestServer();
  ({ compileMarkdown } = await server.ssrLoadModule('/src/compiler/index.ts'));
  ({ generateTableCss } = await server.ssrLoadModule('/src/preview/CssGenerator.ts'));
});

after(async () => server?.close());

test('regular and marked Markdown tables compile into separate style classes', async () => {
  const regular = await compileMarkdown('| A | B |\n|---|---|\n| 1 | 2 |');
  const marked = await compileMarkdown('<!-- table-style: 2 -->\n\n| A | B |\n|---|---|\n| 1 | 2 |');

  assert.match(regular, /<table data-table-style="1"/);
  assert.match(marked, /<table data-table-style="2"/);
  assert.doesNotMatch(marked, /table-style:\s*2/);
});

test('table classes generate independent colors, borders, padding, and margins', () => {
  const css = generateTableCss({
    table1: style({ headerBackground: '#112233', cellPadding: 4 }),
    table2: style({ headerBackground: '#abcdef', borderWidth: 2, cellPadding: 9, marginTop: 15 })
  });

  assert.match(css, /table\[data-table-style="1"\][\s\S]*?padding: 4pt/);
  assert.match(css, /table\[data-table-style="1"\] thead th[\s\S]*?background: #112233/);
  assert.match(css, /table\[data-table-style="2"\][\s\S]*?margin: 15pt 0 12pt/);
  assert.match(css, /table\[data-table-style="2"\] th,[\s\S]*?border: 2pt solid #999999/);
  assert.match(css, /table\[data-table-style="2"\] thead th[\s\S]*?background: #abcdef/);
  assert.match(css, /table\[data-table-style="1"\] td \{[\s\S]*?line-height: 1\.2/);
  assert.match(css, /table\[data-table-style="1"\] td:empty::before \{[\s\S]*?min-height: 1\.2em/);
  assert.match(css, /table\[data-table-style="2"\] td:empty::before \{[\s\S]*?content: "\\00a0"/);
});
