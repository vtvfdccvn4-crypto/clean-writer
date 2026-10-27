import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { detectBrowserExecutable, launchHeadlessBrowser, reservePort, waitForJson } from './lib/browser.mjs';

// Hard-kill durability for IndexedDB drafts (plan G1). The browser process is killed with SIGKILL while
// the draft store is writing, then the same profile is reopened and the surviving draft is read.
//
// Two cases:
//  - paused: the writer stops after its last acknowledged write, then the process is killed. The
//    surviving version must equal the last acknowledged version exactly.
//  - in-flight: the process is killed while writes are still running. The surviving version must be
//    at least the last version read before the kill, and the draft must pass its integrity check.
// Every trial uses a fresh profile, so drafts from one trial cannot satisfy another.

const { chromium } = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const pausedTrials = 5;
const inFlightTrials = 10;
const timeoutMs = 60_000;

const server = await createServer({
  root,
  appType: 'spa',
  logLevel: 'error',
  server: { host: '127.0.0.1', port: await reservePort(), strictPort: true, hmr: false }
});
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const executable = await detectBrowserExecutable();

async function launch(userDataDir) {
  const port = await reservePort();
  const child = launchHeadlessBrowser(executable, port, userDataDir, []);
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = await (browser.contexts()[0] ?? await browser.newContext()).newPage();
  return { child, page };
}

async function kill(child) {
  child.kill('SIGKILL');
  await once(child, 'exit');
}

async function writeUntil(page, predicate) {
  await page.goto(`${origin}/test/fixtures/draft-hard-kill.html?mode=write`);
  await page.waitForFunction(() => window.__acked !== undefined, null, { timeout: timeoutMs });
  await page.waitForFunction(predicate, null, { timeout: timeoutMs });
}

async function readAfterRestart(userDataDir) {
  const { child, page } = await launch(userDataDir);
  try {
    await page.goto(`${origin}/test/fixtures/draft-hard-kill.html?mode=read`);
    await page.waitForFunction(() => window.__readResult !== undefined, null, { timeout: timeoutMs });
    return await page.evaluate(() => window.__readResult);
  } finally {
    await kill(child);
  }
}

async function pausedTrial() {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-kill-paused-'));
  const { child, page } = await launch(userDataDir);
  try {
    await writeUntil(page, () => window.__acked >= 3 + Math.floor(Math.random() * 30));
    await page.evaluate(() => { window.__pauseRequested = true; });
    await page.waitForFunction(() => window.__paused === true || window.__writeFailed === true, null, { timeout: timeoutMs });
    const acknowledged = await page.evaluate(() => window.__acked);
    await kill(child);
    const survived = await readAfterRestart(userDataDir);
    return { case: 'paused', acknowledged, survived: survived.version, intact: survived.intact, found: survived.found, health: survived.health, passed: survived.found && survived.intact && survived.version === acknowledged };
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

async function inFlightTrial() {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-kill-inflight-'));
  const { child, page } = await launch(userDataDir);
  try {
    await writeUntil(page, () => window.__acked >= 3 + Math.floor(Math.random() * 30));
    const acknowledged = await page.evaluate(() => window.__acked);
    await kill(child);
    const survived = await readAfterRestart(userDataDir);
    return { case: 'in-flight', acknowledged, survived: survived.version, intact: survived.intact, found: survived.found, health: survived.health, passed: survived.found && survived.intact && survived.version >= acknowledged };
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

const trials = [];
try {
  for (let index = 0; index < pausedTrials; index += 1) trials.push(await pausedTrial());
  for (let index = 0; index < inFlightTrials; index += 1) trials.push(await inFlightTrial());
} finally {
  await server.close();
}

const passed = trials.filter(trial => trial.passed).length;
const report = { generatedAt: new Date().toISOString(), trials, passed, total: trials.length };
console.log(JSON.stringify(report, null, 2));
if (passed !== trials.length) {
  throw new Error(`Draft hard-kill durability failed in ${trials.length - passed} of ${trials.length} trials.`);
}
