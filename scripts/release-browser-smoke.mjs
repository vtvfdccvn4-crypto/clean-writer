import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { createServer } from 'vite';
import { plainCharacterReferenceEsbuildPlugin, workerDomFreeResolution } from '../vite.shared.ts';
import { NO_BACKGROUND_THROTTLING_FLAGS, launchHeadlessBrowser, detectBrowserExecutable, createBrowserTarget, reservePort, delay, closeQuietly } from './lib/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const serverPort = await reservePort();
const browserExecutable = await detectBrowserExecutable();
const fixtureTimeoutMs = Number(process.env.CLEAR_WRITER_SMOKE_TIMEOUT_MS ?? 60_000);

import { fixtures, expect } from './browser-smoke-fixtures.mjs';

const requestedFixture = process.env.CLEAR_WRITER_SMOKE_FIXTURE?.trim();
const selectedFixtures = requestedFixture
  ? fixtures.filter(fixture => fixture.name === requestedFixture)
  : fixtures;
if (requestedFixture && selectedFixtures.length === 0) {
  throw new Error(`Unknown browser smoke fixture "${requestedFixture}". Available fixtures: ${fixtures.map(fixture => fixture.name).join(', ')}`);
}

const viteServer = await createServer({
  root,
  appType: 'spa',
  optimizeDeps: {
    include: ['extend', 'debug', 'event-emitter', 'event-emitter/pipe', 'css-tree', 'clear-cut'],
    // The DOM-free entries that the worker build uses, so pre-bundled code loads in a worker.
    esbuildOptions: { plugins: [plainCharacterReferenceEsbuildPlugin()] }
  },
  // Worker bundles resolve the same DOM-free entries as the production build.
  worker: { format: 'es', plugins: () => [workerDomFreeResolution()] },
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: serverPort,
    strictPort: true,
    hmr: false
  }
});

try {
  process.stdout.write(`Smoke runtime: server=${serverPort}, timeout=${fixtureTimeoutMs}ms\n`);
  await viteServer.listen();
  process.stdout.write('Smoke runtime: Vite server listening\n');

  const results = [];
  let browserUserAgent = '';
  for (const fixture of selectedFixtures) {
    const fixtureStartedAt = performance.now();
    const browserDebugPort = await reservePort();
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-release-smoke-'));
    let browserProcess;
    let target;
    let session;
    let browserReadyAt = null;
    let cleanupStartedAt = null;
    let cleanupCompletedAt = null;
    let cleanupSucceeded = false;
    let currentPhase = 'starting';
    let fixtureSucceeded = false;
    try {
      const browserLaunchStartedAt = performance.now();
      browserProcess = launchHeadlessBrowser(browserExecutable, browserDebugPort, userDataDir, [...NO_BACKGROUND_THROTTLING_FLAGS, '--disable-extensions']);
      const browserVersion = await waitForBrowserJson(
        browserProcess,
        `http://127.0.0.1:${browserDebugPort}/json/version`,
        100
      );
      browserReadyAt = performance.now();
      browserUserAgent = browserVersion.UserAgent ?? browserUserAgent;
      currentPhase = 'create-target';
      process.stdout.write(`Smoke runtime: browser ready for ${fixture.name} (${browserVersion.Browser ?? browserVersion.UserAgent}) in ${Math.round(browserReadyAt - browserLaunchStartedAt)}ms\n`);
      process.stdout.write(`Running browser fixture: ${fixture.name}\n`);
      const fixtureUrl = new URL(`http://127.0.0.1:${serverPort}${fixture.path}`);
      if (fixture.name === 'browser-authoring-performance-smoke' && process.env.CLEAR_WRITER_PREVIEW_SECTIONS) {
        fixtureUrl.searchParams.set('sections', process.env.CLEAR_WRITER_PREVIEW_SECTIONS);
      }
      if (process.env.CLEAR_WRITER_SMOKE_QUERY) {
        for (const [key, value] of new URLSearchParams(process.env.CLEAR_WRITER_SMOKE_QUERY)) {
          fixtureUrl.searchParams.set(key, value);
        }
      }
      target = await createBrowserTarget(browserDebugPort, fixtureUrl.toString());
      session = await connectToTarget(target.webSocketDebuggerUrl);
      currentPhase = 'fixture';
      if (fixture.viewport) {
        await session.setViewport(fixture.viewport);
      }
      const result = await waitForHarnessResult(session);
      if (result?.ok !== true) {
        console.error('Fixture returned failure result:', JSON.stringify(result, null, 2));
        throw new Error(`${fixture.name} returned failure: ${JSON.stringify(result)}`);
      }
      fixture.validate(result);
      fixtureSucceeded = true;
      results.push({
        name: fixture.name,
        ok: true,
        result,
        diagnostics: {
          browserStartupMs: browserReadyAt === null ? null : Math.round(browserReadyAt - (fixtureStartedAt)),
          fixtureElapsedMs: Math.round(performance.now() - fixtureStartedAt),
          cleanupMs: null,
          consoleErrors: session?.diagnostics.consoleErrors ?? [],
          exceptions: session?.diagnostics.exceptions ?? [],
          networkFailures: session?.diagnostics.networkFailures ?? []
        }
      });
    } finally {
      cleanupStartedAt = performance.now();
      await closeQuietly(session);
      if (target?.id) {
        await closeBrowserTarget(browserDebugPort, target.id).catch(() => undefined);
      }
      await stopBrowser(browserProcess, browserDebugPort);
      await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
      cleanupCompletedAt = performance.now();
      cleanupSucceeded = true;
      const diagnostic = results.find(entry => entry.name === fixture.name);
      if (diagnostic) {
        diagnostic.diagnostics.cleanupMs = Math.round(cleanupCompletedAt - cleanupStartedAt);
        diagnostic.diagnostics.cleanupSucceeded = cleanupSucceeded;
      }
      if (!fixtureSucceeded) {
        console.error(JSON.stringify({
          fixture: fixture.name,
          phase: currentPhase,
          elapsedMs: Math.round(performance.now() - fixtureStartedAt),
          cleanupMs: Math.round(cleanupCompletedAt - cleanupStartedAt),
          cleanupSucceeded,
          consoleErrors: session?.diagnostics.consoleErrors ?? [],
          exceptions: session?.diagnostics.exceptions ?? [],
          networkFailures: session?.diagnostics.networkFailures ?? []
        }, null, 2));
      }
    }
  }

  const smokeReport = {
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    browser: {
      executable: browserExecutable,
      userAgent: browserUserAgent
    },
    fixtures: results.map(({ name, ok, result, diagnostics }) => ({ name, ok, result, diagnostics }))
  };
  process.stdout.write(`${JSON.stringify(smokeReport, null, 2)}\n`);
  if (process.env.CLEAR_WRITER_SMOKE_OUTPUT) {
    await fs.writeFile(process.env.CLEAR_WRITER_SMOKE_OUTPUT, `${JSON.stringify(smokeReport, null, 2)}\n`, 'utf8');
  }
} finally {
  await viteServer.close();
}

async function closeBrowserTarget(debugPort, targetId) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/close/${encodeURIComponent(targetId)}`);
  if (!response.ok) {
    throw new Error(`Failed to close browser target ${targetId} (${response.status}).`);
  }
}

async function waitForBrowserJson(browserProcess, url, attempts = 50) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`Unexpected HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  const details = browserProcess.browserStderr?.trim();
  throw new Error(`Browser CDP did not become ready (launcher exit=${browserProcess.exitCode ?? 'none'}, signal=${browserProcess.signalCode ?? 'none'}): ${lastError instanceof Error ? lastError.message : String(lastError)}${details ? ` Browser stderr: ${details}` : ''}`);
}

async function stopBrowser(browserProcess, debugPort) {
  if (!browserProcess) return;

  if (process.platform === 'win32') {
    await closeBrowserViaCdp(debugPort);
    await delay(250);
    const listeningPid = await findListeningProcessId(debugPort);
    const pids = new Set([listeningPid, browserProcess.exitCode === null ? browserProcess.pid : null].filter(Boolean));
    for (const pid of pids) {
      await execFileAsync('taskkill', ['/PID', String(pid), '/F']).catch(() => undefined);
    }
    return;
  }

  if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) return;
  const exited = once(browserProcess, 'exit').catch(() => undefined);
  browserProcess.kill('SIGTERM');
  const stoppedGracefully = await Promise.race([
    exited.then(() => true),
    delay(1_000).then(() => false)
  ]);
  if (stoppedGracefully || browserProcess.exitCode !== null || browserProcess.signalCode !== null) return;

  browserProcess.kill('SIGKILL');
  await exited;
}

async function closeBrowserViaCdp(debugPort) {
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then(response => response.ok ? response.json() : null).catch(() => null);
  if (!version?.webSocketDebuggerUrl) return;
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await once(socket, 'open').catch(() => undefined);
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  await Promise.race([once(socket, 'close'), delay(1_000)]).catch(() => undefined);
  if (socket.readyState === WebSocket.OPEN) socket.close();
}

async function findListeningProcessId(port) {
  if (process.platform !== 'win32') return null;
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp']).catch(() => ({ stdout: '' }));
  const escapedPort = String(port).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = stdout.match(new RegExp(`(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::\\]):${escapedPort}\\s+[^\\s]+\\s+LISTENING\\s+(\\d+)`, 'i'));
  return match ? Number(match[1]) : null;
}

function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

async function connectToTarget(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await once(socket, 'open');

  let nextId = 0;
  const pending = new Map();
  const diagnostics = {
    consoleErrors: [],
    exceptions: [],
    networkFailures: []
  };

  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data));
    if (payload.id && pending.has(payload.id)) {
      const entry = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) entry.reject(new Error(payload.error.message || 'CDP command failed.'));
      else entry.resolve(payload.result);
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
  await send('Log.enable');
  await send('Network.enable');

  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data));
    if (payload.method === 'Runtime.consoleAPICalled') {
      const type = payload.params.type;
      const args = payload.params.args.map(a => a.value || a.description).join(' ');
      console.log(`[Browser Console ${type}]`, args);
      if (type === 'error') diagnostics.consoleErrors.push(args);
    } else if (payload.method === 'Runtime.exceptionThrown') {
      const exception = payload.params.exceptionDetails.text;
      diagnostics.exceptions.push(exception);
      console.log(`[Browser Exception]`, exception);
    } else if (payload.method === 'Runtime.executionContextCreated') {
      console.log('[Browser Runtime] execution context created');
    } else if (payload.method === 'Page.loadEventFired') {
      console.log('[Browser Page] load event fired');
    } else if (payload.method === 'Page.domContentEventFired') {
      console.log('[Browser Page] DOM content loaded');
    } else if (payload.method === 'Network.loadingFailed') {
      const failure = `${payload.params.errorText} ${payload.params.url ?? ''}`.trim();
      diagnostics.networkFailures.push(failure);
      console.log(`[Browser Network] request failed: ${failure}`);
    } else if (payload.method === 'Network.responseReceived' && payload.params.response.status >= 400) {
      console.log(`[Browser Network] HTTP ${payload.params.response.status}: ${payload.params.response.url}`);
    }
  });

  return {
    diagnostics,
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
      }
      return result.result?.value;
    },
    async close() {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
        await once(socket, 'close').catch(() => undefined);
      }
    },
    async setViewport({ width, height, deviceScaleFactor = 1 }) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor,
        mobile: false
      });
    }
  };
}

async function waitForHarnessResult(session) {
  const started = Date.now();
  let lastProgress;
  let nextProgressLog = started;
  while (Date.now() - started < fixtureTimeoutMs) {
    // A fixture may reload the page on purpose. A poll that lands during the reload is simply not ready yet.
    const result = await session.evaluate(`window.__HARNESS_RESULT__ ?? null`).catch(() => null);
    if (result) return result;
    const progress = await session.evaluate(`({ progress: window.__HARNESS_PROGRESS__ ?? null, ready: window.__CLEAR_WRITER_READY__ === true, bootError: window.__CLEAR_WRITER_BOOT_ERROR__ ?? null, body: document.body?.innerText?.slice(0, 120) ?? '' })`).catch(() => null);
    const progressLabel = progress?.progress ?? (progress?.bootError ? `boot-error: ${progress.bootError}` : progress?.ready ? 'app-ready' : 'booting');
    if (progressLabel !== lastProgress || Date.now() >= nextProgressLog) {
      process.stdout.write(`Fixture progress: ${progressLabel} (${Date.now() - started}ms)\n`);
      lastProgress = progressLabel;
      nextProgressLog = Date.now() + 2_000;
    }
    await delay(100);
  }
  const progress = await session.evaluate(`({ progress: window.__HARNESS_PROGRESS__ ?? null, ready: window.__CLEAR_WRITER_READY__ === true, bootError: window.__CLEAR_WRITER_BOOT_ERROR__ ?? null, body: document.body?.innerText?.slice(0, 120) ?? '' })`).catch(() => null);
  throw new Error(`Browser smoke fixture did not finish within ${fixtureTimeoutMs}ms. Diagnostics: ${JSON.stringify(progress)}.`);
}
