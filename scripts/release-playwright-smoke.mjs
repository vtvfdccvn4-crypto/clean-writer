import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';
import { plainCharacterReferenceEsbuildPlugin, workerDomFreeResolution } from '../vite.shared.ts';
import { detectBrowserExecutable, reservePort } from './lib/browser.mjs';

// Browser coverage through Playwright's own API, so it runs in WebKit as well as Chromium. The Chromium
// smoke runner (release-browser-smoke.mjs) drives Chromium over the DevTools protocol, which WebKit does
// not offer. Each fixture publishes `window.__HARNESS_RESULT__` with `ok`, and this runner requires ok to
// be true and no page error. Select the browser with CLEAR_WRITER_SMOKE_BROWSER=chromium|webkit.
//
// The list covers the behaviour the release depends on that does not need a local directory project
// (the File System Access API is Chromium-only) or DevTools input. Add a fixture here once it passes in both.

const root = path.resolve(import.meta.dirname, '..');
const browserName = process.env.CLEAR_WRITER_SMOKE_BROWSER?.trim() || 'chromium';
const playwright = createRequire(import.meta.url)('playwright');
const browserType = playwright[browserName];
if (!browserType) throw new Error(`Unknown CLEAR_WRITER_SMOKE_BROWSER "${browserName}". Use chromium or webkit.`);

const fixtures = [
  'browser-draft-store-smoke',
  'browser-recovery-smoke',
  'browser-storage-status-smoke',
  'browser-outline-view-smoke',
  'browser-table-helper-smoke',
  'browser-custom-quote-cursor-smoke',
  'browser-preview-freshness-smoke',
  'browser-pdf-job-status-smoke',
  'browser-sidebar-interactions-smoke',
  'browser-opfs-persistence-smoke',
  'browser-large-document-smoke',
  'pagination-lifecycle-smoke',
  'pagination-watchdog-smoke'
];
const selected = process.env.CLEAR_WRITER_SMOKE_FIXTURES?.trim()
  ? process.env.CLEAR_WRITER_SMOKE_FIXTURES.split(',').map(name => name.trim()).filter(Boolean)
  : fixtures;
const timeoutMs = Number(process.env.CLEAR_WRITER_SMOKE_TIMEOUT_MS ?? 180_000);

const serverPort = await reservePort();
const viteServer = await createServer({
  root,
  appType: 'spa',
  optimizeDeps: {
    include: ['extend', 'debug', 'event-emitter', 'event-emitter/pipe', 'css-tree', 'clear-cut'],
    esbuildOptions: { plugins: [plainCharacterReferenceEsbuildPlugin()] }
  },
  worker: { format: 'es', plugins: () => [workerDomFreeResolution()] },
  logLevel: 'error',
  server: { host: '127.0.0.1', port: serverPort, strictPort: true, hmr: false }
});

const launchOptions = browserName === 'chromium'
  ? { executablePath: await detectBrowserExecutable(), args: ['--no-sandbox'] }
  : {};
const results = [];
let browser;
try {
  await viteServer.listen();
  browser = await browserType.launch(launchOptions);
  for (const name of selected) {
    const started = Date.now();
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let result;
    let failure = null;
    try {
      await page.goto(`http://127.0.0.1:${serverPort}/test/fixtures/${name}.html`, { waitUntil: 'load', timeout: timeoutMs });
      await page.waitForFunction(() => window.__HARNESS_RESULT__ !== undefined, null, { timeout: timeoutMs });
      result = await page.evaluate(() => window.__HARNESS_RESULT__);
    } catch (error) {
      failure = error instanceof Error ? error.message.split('\n')[0] : String(error);
    }
    const ok = failure === null && result?.ok === true && pageErrors.length === 0;
    results.push({ name, ok, elapsedMs: Date.now() - started, failure, pageErrors, result: ok ? undefined : result });
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name} (${Date.now() - started} ms)\n`);
    await context.close().catch(() => undefined);
  }
} finally {
  await browser?.close().catch(() => undefined);
  await viteServer.close();
}

const failed = results.filter(item => !item.ok);
console.log(JSON.stringify({ browser: browserName, passed: results.length - failed.length, total: results.length, results }, null, 2));
if (failed.length > 0) {
  throw new Error(`${browserName}: ${failed.length} of ${results.length} fixtures failed: ${failed.map(item => item.name).join(', ')}`);
}
