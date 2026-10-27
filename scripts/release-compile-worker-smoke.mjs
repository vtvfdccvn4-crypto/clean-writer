import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'vite';
import { detectBrowserExecutable, reservePort } from './lib/browser.mjs';

// The compile worker, run from the production worker configuration: parity with the
// page's compiler, supersession, error reporting, crash fallback, and main-thread
// responsiveness. The harness page reports its own checks; this script fails on any miss.

// CLEAR_WRITER_SMOKE_BROWSER=webkit runs the same harness in Playwright's WebKit (the engine
// behind Safari). It defaults to Chromium, which uses the browser named by CLEAR_WRITER_BROWSER.
const browserName = process.env.CLEAR_WRITER_SMOKE_BROWSER?.trim() || 'chromium';
const playwright = createRequire(import.meta.url)('playwright');
const browserType = playwright[browserName];
if (!browserType) throw new Error(`Unknown CLEAR_WRITER_SMOKE_BROWSER "${browserName}". Use chromium or webkit.`);
const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist-harness');
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

await build({ configFile: path.join(root, 'vite.compile-harness.config.ts'), logLevel: 'error' });

const port = await reservePort();
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  try {
    const body = await fs.readFile(path.join(outDir, pathname));
    response.writeHead(200, { 'content-type': contentTypes[path.extname(pathname)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));

const browser = browserName === 'chromium'
  ? await browserType.launch({ executablePath: await detectBrowserExecutable(), args: ['--no-sandbox'] })
  : await browserType.launch();
let result;
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/test/fixtures/compile-worker-harness.html`);
  await page.waitForFunction(() => window.__HARNESS_RESULT__ !== undefined, null, { timeout: 480_000 });
  result = await page.evaluate(() => window.__HARNESS_RESULT__);
  result.pageErrors = pageErrors;
} finally {
  await browser.close();
  server.close();
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  throw new Error(`Compile worker integration failed: ${result.error ?? JSON.stringify(result.parity)}`);
}
