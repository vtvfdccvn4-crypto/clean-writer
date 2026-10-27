import fs from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createServer } from 'vite';
import { plainCharacterReferenceEsbuildPlugin, workerDomFreeResolution } from '../vite.shared.ts';
import { detectBrowserExecutable, reservePort } from './lib/browser.mjs';
import { fixtures as allFixtures } from './browser-smoke-fixtures.mjs';

// The full browser smoke suite through Playwright's own API, so it runs in WebKit as well as Chromium.
// release-browser-smoke.mjs drives Chromium over the DevTools protocol, which WebKit does not offer. Both
// runners use the same fixture list (browser-smoke-fixtures.mjs), apply each fixture's viewport and query,
// and run its validate function on the result.
//
// Select the browser with CLEAR_WRITER_SMOKE_BROWSER=chromium|webkit. Select fixtures with
// CLEAR_WRITER_SMOKE_FIXTURES=name,name (default: all). CLEAR_WRITER_SMOKE_QUERY applies to every fixture.

const root = path.resolve(import.meta.dirname, '..');
const browserName = process.env.CLEAR_WRITER_SMOKE_BROWSER?.trim() || 'chromium';
const playwright = createRequire(import.meta.url)('playwright');
const browserType = playwright[browserName];
if (!browserType) throw new Error(`Unknown CLEAR_WRITER_SMOKE_BROWSER "${browserName}". Use chromium or webkit.`);

const requestedNames = process.env.CLEAR_WRITER_SMOKE_FIXTURES?.trim()
  ? process.env.CLEAR_WRITER_SMOKE_FIXTURES.split(',').map(name => name.trim()).filter(Boolean)
  : null;
const selected = requestedNames
  ? allFixtures.filter(fixture => requestedNames.includes(fixture.name))
  : allFixtures;
if (requestedNames && selected.length !== requestedNames.length) {
  const known = new Set(allFixtures.map(fixture => fixture.name));
  throw new Error(`Unknown fixture in CLEAR_WRITER_SMOKE_FIXTURES: ${requestedNames.filter(name => !known.has(name)).join(', ')}`);
}
const timeoutMs = Number(process.env.CLEAR_WRITER_SMOKE_TIMEOUT_MS ?? 120_000);
const defaultViewport = { width: 1280, height: 800 };

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

/** The fixture's URL, with the same query rules as release-browser-smoke.mjs. */
function fixtureUrl(fixture) {
  const url = new URL(`http://127.0.0.1:${serverPort}${fixture.path}`);
  if (fixture.name === 'browser-authoring-performance-smoke' && process.env.CLEAR_WRITER_PREVIEW_SECTIONS) {
    url.searchParams.set('sections', process.env.CLEAR_WRITER_PREVIEW_SECTIONS);
  }
  if (process.env.CLEAR_WRITER_SMOKE_QUERY) {
    for (const [key, value] of new URLSearchParams(process.env.CLEAR_WRITER_SMOKE_QUERY)) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function runFixture(fixture) {
  const started = Date.now();
  // A persistent profile per fixture, not an ephemeral context: WebKit's ephemeral contexts fail OPFS with
  // "UnknownError", and the application stores projects in OPFS.
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-playwright-smoke-'));
  const context = await browserType.launchPersistentContext(userDataDir, {
    ...launchOptions,
    headless: true,
    viewport: fixture.viewport ? { width: fixture.viewport.width, height: fixture.viewport.height } : defaultViewport,
    deviceScaleFactor: fixture.viewport?.deviceScaleFactor ?? 1
  });
  const page = context.pages()[0] ?? await context.newPage();
  const pageErrors = [];
  const consoleMessages = [];
  page.on('pageerror', error => pageErrors.push(error.message || String(error) || '(error without a message)'));
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push(`${message.type()}: ${message.text()}`.slice(0, 300));
  });
  page.on('crash', () => pageErrors.push('the page crashed'));
  let failure = null;
  let result;
  try {
    await page.goto(fixtureUrl(fixture), { waitUntil: 'load', timeout: timeoutMs });
    await page.waitForFunction(() => window.__HARNESS_RESULT__ !== undefined, null, { timeout: timeoutMs });
    result = await page.evaluate(() => window.__HARNESS_RESULT__);
    if (result?.ok !== true) throw new Error(`returned failure: ${JSON.stringify(result).slice(0, 1000)}`);
    if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join(' | ')}`);
    fixture.validate(result);
  } catch (error) {
    failure = error instanceof Error ? error.message.split('\n')[0] : String(error);
  } finally {
    await context.close().catch(() => undefined);
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
  return {
    name: fixture.name,
    ok: failure === null,
    elapsedMs: Date.now() - started,
    failure,
    pageErrors,
    consoleMessages: failure === null ? undefined : consoleMessages.slice(-20),
    result: failure === null ? undefined : result
  };
}

const results = [];
try {
  await viteServer.listen();
  for (const fixture of selected) {
    const outcome = await runFixture(fixture);
    results.push(outcome);
    process.stdout.write(`${outcome.ok ? 'PASS' : 'FAIL'} ${fixture.name} (${outcome.elapsedMs} ms)${outcome.ok ? '' : `: ${outcome.failure}`}\n`);
  }
} finally {
  await viteServer.close();
}

const failed = results.filter(item => !item.ok);
console.log(JSON.stringify({ browser: browserName, passed: results.length - failed.length, total: results.length, results }, null, 2));
if (failed.length > 0) {
  throw new Error(`${browserName}: ${failed.length} of ${results.length} fixtures failed: ${failed.map(item => item.name).join(', ')}`);
}
