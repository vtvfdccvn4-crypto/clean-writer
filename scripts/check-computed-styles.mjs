// Computed-style baseline.
//
// A token refactor is supposed to be invisible, but "nothing looks different"
// is otherwise an unverifiable claim in this repo: there is no visual
// regression testing. This mounts the application stylesheet against a fixed
// probe DOM, reads what every themed component actually computes to, and
// diffs it against a committed baseline. A refactor that changes no pixels
// leaves the baseline untouched; one that does has to update it in the same
// commit, where a reviewer can see exactly what moved.
//
//   node scripts/check-computed-styles.mjs            verify against baseline
//   node scripts/check-computed-styles.mjs --update   record a new baseline
//
// Styles are read under both screen and print emulation, so a rule that must
// not reach PDF export (the sheet shadow) is covered by the same check.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'vite';
import { launchHeadlessBrowser, detectBrowserExecutable, createBrowserTarget, reservePort, delay } from './lib/browser.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const baselinePath = path.join(root, 'test', 'fixtures', 'computed-styles-baseline.json');
const probePath = '/test/fixtures/computed-styles-probe.html';
const shouldUpdate = process.argv.includes('--update');
const readyTimeoutMs = Number(process.env.CLEAR_WRITER_PROBE_TIMEOUT_MS ?? 60_000);

const serverPort = await reservePort();
const browserExecutable = await detectBrowserExecutable();
const viteServer = await createServer({
  root,
  appType: 'spa',
  logLevel: 'error',
  server: { host: '127.0.0.1', port: serverPort, strictPort: true }
});

let browserProcess;
let userDataDir;
let session;
const trace = (stage) => process.stderr.write(`[computed-styles] ${stage}
`);

try {
  trace('starting vite');
  await viteServer.listen();
  trace('vite listening');

  const debugPort = await reservePort();
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-computed-styles-'));
  browserProcess = launchHeadlessBrowser(browserExecutable, debugPort, userDataDir, ['--disable-extensions']);
  trace('browser launched');
  await waitForBrowserJson(browserProcess, `http://127.0.0.1:${debugPort}/json/version`);
  trace('cdp ready');

  const target = await createBrowserTarget(debugPort, `http://127.0.0.1:${serverPort}${probePath}`);
  trace('target created');
  session = await connectToTarget(target.webSocketDebuggerUrl);
  trace('cdp attached');
  await session.waitForProbe(readyTimeoutMs);
  trace('probe ready');

  const captured = {};
  for (const media of ['screen', 'print']) {
    await session.send('Emulation.setEmulatedMedia', { media });
    const collected = await session.evaluate(`window.__collectComputedStyles(${JSON.stringify(media)})`);
    captured[media] = collected.readings;
  }

  const report = { probe: probePath, media: captured };

  if (shouldUpdate) {
    await fs.writeFile(baselinePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`Computed-style baseline written: ${path.relative(root, baselinePath)}\n`);
  } else {
    const baseline = await readBaseline();
    const differences = diff(baseline.media, report.media);
    if (differences.length > 0) {
      process.stdout.write(`Computed styles changed in ${differences.length} place(s):\n`);
      for (const line of differences) process.stdout.write(`  ${line}\n`);
      process.stdout.write('\nIf these changes are intended, re-run with --update and commit the baseline alongside them.\n');
      process.exitCode = 1;
    } else {
      const probeCount = Object.keys(report.media.screen).length;
      process.stdout.write(`Computed styles match the baseline (${probeCount} probes, screen and print).\n`);
    }
  }
} catch (error) {
  trace(`failed: ${error instanceof Error ? error.message : String(error)}`);
  throw error;
} finally {
  if (session) await session.close().catch(() => undefined);
  if (browserProcess) await stopBrowser(browserProcess);
  await viteServer.close();
  if (userDataDir) await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

async function readBaseline() {
  try {
    return JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`No baseline at ${path.relative(root, baselinePath)}. Record one with: node scripts/check-computed-styles.mjs --update`);
    }
    throw error;
  }
}

function diff(expected, actual) {
  const differences = [];
  for (const media of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const before = expected[media] ?? {};
    const after = actual[media] ?? {};
    for (const probe of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!(probe in before)) {
        differences.push(`${media} / ${probe}: probe added`);
        continue;
      }
      if (!(probe in after)) {
        differences.push(`${media} / ${probe}: probe removed`);
        continue;
      }
      for (const property of new Set([...Object.keys(before[probe]), ...Object.keys(after[probe])])) {
        const was = before[probe][property];
        const now = after[probe][property];
        if (was !== now) differences.push(`${media} / ${probe} / ${property}: ${was || '(unset)'} -> ${now || '(unset)'}`);
      }
    }
  }
  return differences;
}

async function waitForBrowserJson(child, url, attempts = 50) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      // Without a signal a stalled socket parks here forever and the retry
      // loop never gets another turn, so the whole run hangs instead of
      // failing with a usable message.
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  // The launcher process exits 0 as soon as it hands off to the detached
  // browser, so its exit is not a failure and must not end the wait -- only a
  // CDP endpoint that never answers is. Report the code for diagnosis only.
  throw new Error(`Browser CDP did not become ready (launcher exit=${child.exitCode ?? 'none'}): ${lastError?.message ?? 'unknown error'} ${child.browserStderr ?? ''}`);
}

async function connectToTarget(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await once(socket, 'open');

  let nextId = 0;
  const pending = new Map();
  const exceptions = [];

  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data));
    if (payload.id && pending.has(payload.id)) {
      const entry = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) entry.reject(new Error(payload.error.message || 'CDP command failed.'));
      else entry.resolve(payload.result);
    } else if (payload.method === 'Runtime.exceptionThrown') {
      exceptions.push(payload.params.exceptionDetails.text);
    }
  });

  async function send(method, params = {}) {
    const id = ++nextId;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  await send('Page.enable');
  await send('Runtime.enable');

  async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'Probe evaluation failed.');
    return result.value;
  }

  async function waitForProbe(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ready = await evaluate('window.__probeReady === true').catch(() => false);
      if (ready) return;
      await delay(150);
    }
    const detail = exceptions.length > 0 ? ` Page exceptions: ${exceptions.join('; ')}` : '';
    throw new Error(`The probe page never signalled readiness.${detail}`);
  }

  return {
    send,
    evaluate,
    waitForProbe,
    close: async () => {
      socket.close();
      await once(socket, 'close').catch(() => undefined);
    }
  };
}

async function stopBrowser(child) {
  // child.kill() only signals the launcher. Edge and Chrome spawn the renderer,
  // GPU, network, storage and crashpad processes as siblings, so on Windows
  // killing the parent orphans them and they accumulate across runs until new
  // launches stall. Take the whole tree down.
  if (process.platform === 'win32' && child.pid) {
    await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => undefined);
  } else {
    child.kill();
  }
  // Teardown is best effort: a browser that will not report its exit must not
  // hold the process open, or a cleanup problem masquerades as a hung check.
  if (child.exitCode === null) {
    await Promise.race([once(child, 'exit').catch(() => undefined), delay(5_000)]);
  }
}

