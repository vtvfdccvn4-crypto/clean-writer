import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

const packageRoot = path.resolve(import.meta.dirname, '..');
let server;
let contracts;
let model;
let protocol;
let textBundle;

before(async () => {
  server = await createServer({
    root: packageRoot,
    appType: 'custom',
    server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true }
  });
  [contracts, model, protocol, textBundle] = await Promise.all([
    server.ssrLoadModule('/src/contracts.ts'),
    server.ssrLoadModule('/src/model.ts'),
    server.ssrLoadModule('/src/protocol.ts'),
    server.ssrLoadModule('/src/text-bundle.ts')
  ]);
});

after(async () => server?.close());

test('text bundles escape source content and preserve line structure', () => {
  const output = textBundle.compileTextBundle({
    title: '<Repository>',
    files: [{ path: 'src/<unsafe>.ts', text: '<script>alert(1)</script>\nconst x = 1;' }]
  });
  assert.doesNotMatch(output.html, /<script>/);
  assert.match(output.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(output.html, /source-line-number[^>]*>2</);
  assert.match(output.css, /@page/);
});

test('render identities are stable, compact, and reject ambiguous extension data', async () => {
  const first = await model.createPdfRenderJob({ html: '<p>A</p>', css: '@page{}', extensionIdentity: { z: 1, a: 2 } });
  const second = await model.createPdfRenderJob({ html: '<p>A</p>', css: '@page{}', extensionIdentity: { a: 2, z: 1 } });
  assert.equal(first.renderId, second.renderId);
  assert.match(first.renderId, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(first), true);
  const cycle = {};
  cycle.self = cycle;
  await assert.rejects(() => model.createPdfRenderJob({ html: '<p>A</p>', css: '@page{}', extensionIdentity: cycle }), /cycles/);
});

test('artifact validation enforces contiguous pages and deep immutability', () => {
  const valid = {
    schemaVersion: contracts.PDF_ARTIFACT_SCHEMA_VERSION,
    artifactId: 'artifact-1',
    renderId: 'a'.repeat(64),
    html: '<div class="pagedjs_page"></div>',
    css: '@page{}',
    pageCount: 1,
    pages: [{ number: 1, anchor: 'start' }]
  };
  const artifact = model.createPdfArtifact(valid);
  assert.equal(Object.isFrozen(artifact.pages[0]), true);
  assert.throws(() => model.createPdfArtifact({ ...valid, pages: [{ number: 2 }] }), /contiguous/);
});

test('budget ignores script/style payloads and validates options', () => {
  const budget = model.estimatePaginationBudget({ html: '<style>' + 'x'.repeat(20_000) + '</style><p>Body</p><img src="x">' });
  assert.ok(budget.textCharacters < 100);
  assert.equal(budget.imageCount, 1);
  assert.ok(budget.timeoutMs >= 30_000 && budget.timeoutMs <= 300_000);
  assert.throws(() => model.estimatePaginationBudget({ html: '<p>x</p>' }, { minimumTimeoutMs: -1 }), /positive/);
});

test('cache is render-keyed LRU and protocol validators reject malformed messages', () => {
  const cache = new model.PdfArtifactCache(2);
  const artifact = id => model.createPdfArtifact({
    schemaVersion: contracts.PDF_ARTIFACT_SCHEMA_VERSION,
    artifactId: id,
    renderId: id.repeat(64).slice(0, 64),
    html: '<p>x</p>', css: '@page{}', pageCount: 1, pages: [{ number: 1 }]
  });
  cache.set(artifact('a'));
  cache.set(artifact('b'));
  cache.get('a'.repeat(64));
  cache.set(artifact('c'));
  assert.equal(cache.get('b'.repeat(64)), undefined);
  assert.equal(protocol.isRenderMessage({ type: contracts.RENDER_MESSAGE }), false);
});

test('isolated package has no imports from the application source tree', () => {
  for (const filename of fs.readdirSync(path.join(packageRoot, 'src'))) {
    if (!filename.endsWith('.ts') || filename.endsWith('.d.ts')) continue;
    const source = fs.readFileSync(path.join(packageRoot, 'src', filename), 'utf8');
    assert.doesNotMatch(source, /from\s+['"](?:\.\.\/){2,}src\//, filename);
    assert.doesNotMatch(source, /clear-writer-pdf-preview|EditorManager|ProjectMetadata/, filename);
  }
});
