const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let escapeHtml;
const modal = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'project-flow-modal.ts'), 'utf8');

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24689 } } });
  ({ escapeHtml } = await server.ssrLoadModule('/src/utils/escapeHtml.ts'));
});

after(async () => {
  await server?.close();
});

test('the open dialog offers only the local computer and browser storage, not recent projects', () => {
  assert.match(modal, /btn-modal-open-file/);
  assert.match(modal, /btn-modal-browser-storage/);
  assert.doesNotMatch(modal, /recentWorkspaces|recent-item|btn-modal-open-dir/);
});

test('recent project names are HTML-escaped wherever they are rendered', () => {
  const escaped = escapeHtml('<img src=x onerror=alert(1)>"quoted"&\'single\'');

  assert.equal(
    escaped,
    '&lt;img src=x onerror=alert(1)&gt;&quot;quoted&quot;&amp;&#39;single&#39;'
  );
  assert.doesNotMatch(escaped, /<|>/);
});
