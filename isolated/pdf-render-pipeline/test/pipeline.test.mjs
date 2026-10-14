import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

const packageRoot = path.resolve(import.meta.dirname, '..');
let server;
let artifactModule;
let budgetModule;
let cacheModule;
let contracts;
let jobModule;

before(async () => {
  server = await createServer({ root: packageRoot, appType: 'custom', server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true } });
  [artifactModule, budgetModule, cacheModule, contracts, jobModule] = await Promise.all([
    server.ssrLoadModule('/src/artifact.ts'),
    server.ssrLoadModule('/src/budget.ts'),
    server.ssrLoadModule('/src/cache.ts'),
    server.ssrLoadModule('/src/contracts.ts'),
    server.ssrLoadModule('/src/job.ts')
  ]);
});

after(async () => server?.close());

test('render jobs use stable SHA-256 identities and freeze their boundary', async () => {
  const left = await jobModule.createPdfRenderJob({ html: '<p>A</p>', css: '@page{}', extensionIdentity: { z: 1, a: 2 } });
  const right = await jobModule.createPdfRenderJob({ html: '<p>A</p>', css: '@page{}', extensionIdentity: { a: 2, z: 1 } });
  assert.match(left.renderId, /^[a-f0-9]{64}$/);
  assert.equal(left.renderId, right.renderId);
  assert.equal(Object.isFrozen(left), true);
});

test('artifacts reject inconsistent pages and are deeply frozen', () => {
  const valid = {
    schemaVersion: contracts.PDF_ARTIFACT_SCHEMA_VERSION,
    artifactId: 'request-1',
    renderId: 'a'.repeat(64),
    html: '<div class="pagedjs_page"></div>',
    css: '@page{}',
    pageCount: 1,
    pages: [{ number: 1 }]
  };
  const artifact = artifactModule.createPdfArtifact(valid);
  assert.equal(Object.isFrozen(artifact.pages[0]), true);
  assert.throws(() => artifactModule.createPdfArtifact({ ...valid, pages: [{ number: 2 }] }), /contiguous/);
});

test('budget strips script/style payloads and remains bounded', () => {
  const budget = budgetModule.estimatePaginationBudget({ html: '<script>' + 'x'.repeat(10_000) + '</script><p>Body</p><img src="x">' });
  assert.ok(budget.textCharacters < 100);
  assert.equal(budget.imageCount, 1);
  assert.ok(budget.timeoutMs >= 30_000 && budget.timeoutMs <= 300_000);
});

test('artifact cache uses render identity and evicts least-recently-used entries', () => {
  const cache = new cacheModule.PdfArtifactCache(2);
  const make = id => artifactModule.createPdfArtifact({
    schemaVersion: 1, artifactId: id, renderId: id.repeat(64).slice(0, 64), html: '<p>x</p>', css: '@page{}', pageCount: 1, pages: [{ number: 1 }]
  });
  cache.set(make('a'));
  cache.set(make('b'));
  cache.get('a'.repeat(64));
  cache.set(make('c'));
  assert.equal(cache.get('b'.repeat(64)), undefined);
  assert.ok(cache.get('a'.repeat(64)));
});

test('isolated source has no imports from the application tree', () => {
  const sourceDirectory = path.join(packageRoot, 'src');
  for (const filename of fs.readdirSync(sourceDirectory)) {
    if (!filename.endsWith('.ts') || filename.endsWith('.d.ts')) continue;
    const source = fs.readFileSync(path.join(sourceDirectory, filename), 'utf8');
    assert.doesNotMatch(source, /from\s+['"](?:\.\.\/){2,}src\//, filename);
    assert.doesNotMatch(source, /clear-writer-pdf|Clear Writer/, filename);
  }
});
