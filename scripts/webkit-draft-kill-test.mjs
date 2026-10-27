import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import { reservePort } from './lib/browser.mjs';

// WebKit counterpart of scripts/draft-hard-kill-test.mjs (plan G1, Safari). Playwright's WebKit launches
// the browser itself, so the processes are found by name and killed with SIGKILL. The run fails if no
// WebKit process is found, so a kill that did not happen cannot pass. Runs in the WebKit CI job.

const execFileAsync = promisify(execFile);
const playwright = createRequire(import.meta.url)('playwright');
const root = path.resolve(import.meta.dirname, '..');
const pausedTrials = 3;
const inFlightTrials = 3;
const timeoutMs = 90_000;
const webkitProcess = /WebKitWebProcess|WebKitNetworkProcess|WebKitGPUProcess|MiniBrowser/;

const server = await createServer({
  root,
  appType: 'spa',
  logLevel: 'error',
  server: { host: '127.0.0.1', port: await reservePort(), strictPort: true, hmr: false }
});
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');

async function launch(userDataDir) {
  const context = await playwright.webkit.launchPersistentContext(userDataDir, { headless: true });
  const page = context.pages()[0] ?? await context.newPage();
  return { context, page };
}

/** SIGKILLs every WebKit process, then returns their ids. Fails if there are none. */
async function killWebKit() {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid,args']);
  const pids = stdout.split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter(match => match && webkitProcess.test(match[2]) && Number(match[1]) !== process.pid)
    .map(match => Number(match[1]));
  if (pids.length === 0) {
    // Show the candidate processes, so a renamed WebKit binary is visible in the log.
    const candidates = stdout.split('\n').filter(line => /webkit|browser|pw_/i.test(line)).slice(0, 20);
    throw new Error(`No WebKit process was found to kill. Candidates: ${JSON.stringify(candidates)}`);
  }
  for (const pid of pids) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
  return pids.length;
}

async function writeUntil(page, predicate) {
  await page.goto(`${origin}/test/fixtures/draft-hard-kill.html?mode=write`);
  await page.waitForFunction(() => window.__acked !== undefined, null, { timeout: timeoutMs });
  await page.waitForFunction(predicate, null, { timeout: timeoutMs });
}

async function readAfterRestart(userDataDir) {
  const { context, page } = await launch(userDataDir);
  try {
    await page.goto(`${origin}/test/fixtures/draft-hard-kill.html?mode=read`);
    await page.waitForFunction(() => window.__readResult !== undefined, null, { timeout: timeoutMs });
    return await page.evaluate(() => window.__readResult);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function trial(kind) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), `clear-writer-webkit-kill-${kind}-`));
  const { page } = await launch(userDataDir);
  try {
    const threshold = 3 + Math.floor(Math.random() * 20);
    await writeUntil(page, () => window.__acked >= threshold);
    if (kind === 'paused') {
      await page.evaluate(() => { window.__pauseRequested = true; });
      await page.waitForFunction(() => window.__paused === true || window.__writeFailed === true, null, { timeout: timeoutMs });
    }
    const acknowledged = await page.evaluate(() => window.__acked);
    const killed = await killWebKit();
    const survived = await readAfterRestart(userDataDir);
    const passed = survived.found && survived.intact
      && (kind === 'paused' ? survived.version === acknowledged : survived.version >= acknowledged);
    return { case: kind, acknowledged, survived: survived.version, intact: survived.intact, found: survived.found, health: survived.health, processesKilled: killed, passed };
  } finally {
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
}

const trials = [];
try {
  for (let index = 0; index < pausedTrials; index += 1) trials.push(await trial('paused'));
  for (let index = 0; index < inFlightTrials; index += 1) trials.push(await trial('in-flight'));
} finally {
  await server.close();
}

const passed = trials.filter(item => item.passed).length;
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), browser: 'webkit', trials, passed, total: trials.length }, null, 2));
if (passed !== trials.length) throw new Error(`WebKit draft hard-kill durability failed in ${trials.length - passed} of ${trials.length} trials.`);
process.exit(0);
