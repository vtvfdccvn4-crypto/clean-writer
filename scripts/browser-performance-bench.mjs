import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import { plainCharacterReferenceEsbuildPlugin, workerDomFreeResolution } from '../vite.shared.ts';
import { detectBrowserExecutable, reservePort } from './lib/browser.mjs';

// Performance of the worker compile, the real preview scheduler, and memory, for the proposed default range
// (400,000 to 700,000 characters), in any Playwright browser. Each run loads test/fixtures/live-large-section-bench
// in a fresh profile and samples the proportional set size (PSS) of that browser's processes while it runs.
// Chromium and WebKit results are separate: each browser's default is decided on its own results.
//
// CLEAR_WRITER_SMOKE_BROWSER=chromium|webkit selects the browser. CLEAR_WRITER_BENCH_OUTPUT=<file> also writes the JSON.
// CLEAR_WRITER_BENCH_SIZES=200,316 overrides the page counts (about 442,000 and 699,000 characters).

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const browserName = process.env.CLEAR_WRITER_SMOKE_BROWSER?.trim() || 'chromium';
const playwright = createRequire(import.meta.url)('playwright');
const browserType = playwright[browserName];
if (!browserType) throw new Error(`Unknown CLEAR_WRITER_SMOKE_BROWSER "${browserName}". Use chromium or webkit.`);
const processPattern = browserName === 'webkit' ? /WebKit|MiniBrowser/ : /chrom|headless/i;
const sizes = (process.env.CLEAR_WRITER_BENCH_SIZES ?? '200,316').split(',').map(Number);
const launchOptions = browserName === 'chromium'
  ? { executablePath: await detectBrowserExecutable(), args: ['--no-sandbox'] }
  : {};
const round = value => Math.round(value * 10) / 10;

/** The summed PSS, in KB, of every process of this browser, read from /proc. */
async function browserPssKb() {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid,args']);
  let totalKb = 0;
  for (const line of stdout.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (!match || Number(match[1]) === process.pid || !processPattern.test(match[2])) continue;
    try {
      const rollup = await fs.readFile(`/proc/${match[1]}/smaps_rollup`, 'utf8');
      const pss = rollup.match(/^Pss:\s+(\d+) kB/m);
      if (pss) totalKb += Number(pss[1]);
    } catch {
      // The process exited between the listing and the read.
    }
  }
  return totalKb;
}

/** Loads the bench page with a query, and returns its result with the peak memory during the load. */
async function loadBench(serverPort, query) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-bench-'));
  const context = await browserType.launchPersistentContext(userDataDir, { ...launchOptions, headless: true });
  const page = context.pages()[0] ?? await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let running = true;
  let peakKb = 0;
  const sampler = (async () => {
    while (running) {
      peakKb = Math.max(peakKb, await browserPssKb());
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  })();
  const started = Date.now();
  try {
    await page.goto(`http://127.0.0.1:${serverPort}/test/fixtures/live-large-section-bench.html?${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__HARNESS_RESULT__ !== undefined, null, { timeout: 1_200_000 });
    const result = await page.evaluate(() => window.__HARNESS_RESULT__);
    return { result, peakPssMb: round(peakKb / 1024), wallMs: Date.now() - started, pageErrors };
  } finally {
    running = false;
    await sampler;
    await context.close().catch(() => undefined);
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

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

const runs = [];
try {
  await viteServer.listen();
  const idle = await loadBench(serverPort, 'pages=2&mode=worker-only');
  runs.push({ label: 'idle baseline', pages: 2, peakPssMb: idle.peakPssMb, pageErrors: idle.pageErrors, ok: idle.result?.ok === true });
  for (const pages of sizes) {
    const cold = await loadBench(serverPort, `pages=${pages}&mode=worker-only`);
    const r = cold.result;
    runs.push({
      label: 'worker-only: cold, warm and first render',
      pages,
      sourceCharacters: r?.sourceCharacters,
      ok: r?.ok === true,
      peakPssMb: cold.peakPssMb,
      coldCompileMs: r?.workerFirstCompile?.elapsedMs,
      warmCompileMs: r?.workerWarmCompile?.elapsedMs,
      renderFirstMs: r?.renderFirst?.elapsedMs,
      renderAfterEditMs: r?.renderAfterEdit?.elapsedMs,
      pageErrors: cold.pageErrors,
      error: r?.error
    });
    for (const gap of [1500, 300]) {
      const scheduled = await loadBench(serverPort, `pages=${pages}&mode=scheduler&edits=30&gap=${gap}`);
      const s = scheduled.result?.scheduledSequence;
      runs.push({
        label: `real scheduler, edit every ${gap} ms`,
        pages,
        sourceCharacters: scheduled.result?.sourceCharacters,
        ok: scheduled.result?.ok === true,
        peakPssMb: scheduled.peakPssMb,
        fires: s?.fires,
        rendered: s?.rendered,
        superseded: s?.superseded,
        renderP50Ms: s?.render?.p50,
        renderP95Ms: s?.render?.p95,
        fireToRenderedP95Ms: s?.fireToRendered?.p95,
        pageErrors: scheduled.pageErrors,
        error: scheduled.result?.error
      });
    }
  }
} finally {
  await viteServer.close();
}

const report = { browser: browserName, generatedAt: new Date().toISOString(), runs };
const output = JSON.stringify(report, null, 2);
console.log(output);
if (process.env.CLEAR_WRITER_BENCH_OUTPUT) await fs.writeFile(process.env.CLEAR_WRITER_BENCH_OUTPUT, output);
if (runs.some(run => !run.ok)) throw new Error(`${browserName}: a performance run did not complete. See the report above.`);
