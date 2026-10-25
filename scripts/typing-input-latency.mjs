import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'vite';
import { NO_BACKGROUND_THROTTLING_FLAGS, launchHeadlessBrowser, detectBrowserExecutable, createBrowserTarget, waitForJson, reservePort, delay } from './lib/browser.mjs';

/**
 * Types real key events into the editor on the 1,000-page corpus. Keys go through
 * the browser's input pipeline over the DevTools protocol, so the editor receives
 * trusted input events, not transactions.
 *
 * Gate (plan section 6): no long task over 50 ms during typing, and p95 input
 * latency at or below 100 ms. Latency is measured from the input event to the
 * animation frame that shows it, and Event Timing reports slow interactions.
 */
const root = path.resolve(import.meta.dirname, '..');
const keystrokeCount = positiveInteger(readArgument('--keystrokes'), 200);
const warmupCount = 20;
const outputArgument = readArgument('--output');
const fixturePath = '/test/fixtures/editor-keyboard-latency.html';
const serverPort = await reservePort();
const browserDebugPort = await reservePort();
const browserExecutable = await detectBrowserExecutable();
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-keyboard-latency-'));

const viteServer = await createServer({
  root,
  appType: 'spa',
  optimizeDeps: { include: ['extend', 'debug', 'event-emitter', 'event-emitter/pipe', 'css-tree', 'clear-cut'] },
  logLevel: 'error',
  server: { host: '127.0.0.1', port: serverPort, strictPort: true, hmr: false }
});

let browserProcess;
let socket;
try {
  await viteServer.listen();
  browserProcess = launchHeadlessBrowser(browserExecutable, browserDebugPort, userDataDir, NO_BACKGROUND_THROTTLING_FLAGS);
  const version = await waitForJson(`http://127.0.0.1:${browserDebugPort}/json/version`);
  const target = await createBrowserTarget(browserDebugPort, `http://127.0.0.1:${serverPort}${fixturePath}`);
  const session = await connect(target.webSocketDebuggerUrl);
  socket = session.socket;

  await waitFor(session, 'window.__KEYBOARD_BENCH__ !== undefined', 60_000);
  const documentChars = await session.evaluate('window.__KEYBOARD_BENCH__.documentChars');
  await session.evaluate(`window.__KEYBOARD_BENCH__.focus(${Math.floor(documentChars / 2)})`);
  await delay(300);

  // Warm-up: first keystrokes pay for lazy work in the editor and are not measured.
  for (let index = 0; index < warmupCount; index += 1) await typeKey(session, 'a');
  await session.evaluate('window.__KEYBOARD_BENCH__.takeLongTasks(); window.__KEYBOARD_BENCH__.takeEventTimings();');

  const latencies = [];
  for (let index = 0; index < keystrokeCount; index += 1) {
    await typeKey(session, 'b');
    latencies.push(await session.evaluate('window.__KEYBOARD_BENCH__.afterKeystroke()', 30_000));
  }
  const longTasks = await session.evaluate('window.__KEYBOARD_BENCH__.takeLongTasks()');
  const eventTimings = await session.evaluate('window.__KEYBOARD_BENCH__.takeEventTimings()');

  const result = {
    generatedAt: new Date().toISOString(),
    browser: version.Browser,
    runtime: process.version,
    documentChars,
    keystrokes: keystrokeCount,
    keystrokeToNextFrameMs: summarize(latencies),
    eventTimingOver16msCount: eventTimings.length,
    eventTimingOver16msMs: summarize(eventTimings),
    longTaskCount: longTasks.length,
    longTaskMaxMs: round(Math.max(0, ...longTasks)),
    longTasksOver50msCount: longTasks.filter(duration => duration > 50).length,
    gate: {
      noLongTaskOver50ms: longTasks.every(duration => duration <= 50),
      p95LatencyAtOrBelow100ms: summarize(latencies).p95 <= 100
    }
  };
  if (outputArgument) await fs.writeFile(path.resolve(root, outputArgument), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  socket?.close();
  browserProcess?.kill();
  await viteServer.close();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

/** Sends one key press through the browser as trusted keydown and keyup events. */
async function typeKey(session, character) {
  const code = `Key${character.toUpperCase()}`;
  const keyCode = character.toUpperCase().charCodeAt(0);
  await session.command('Input.dispatchKeyEvent', { type: 'keyDown', key: character, code, text: character, unmodifiedText: character, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await session.command('Input.dispatchKeyEvent', { type: 'keyUp', key: character, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}

async function waitFor(session, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await session.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${expression}.`);
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const payload = JSON.parse(String(event.data));
    if (payload.id && pending.has(payload.id)) {
      const entry = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) entry.reject(new Error(payload.error.message || 'CDP command failed.'));
      else entry.resolve(payload.result);
    }
  });
  const command = (method, params = {}) => {
    const id = ++nextId;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return result;
  };
  await command('Page.enable');
  await command('Runtime.enable');
  return {
    socket,
    command,
    async evaluate(expression, timeoutMs = 30_000) {
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Browser evaluation timed out after ${timeoutMs}ms.`)), timeoutMs);
      });
      let evaluated;
      try {
        evaluated = await Promise.race([command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), timeout]);
      } finally {
        clearTimeout(timer);
      }
      if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.text || 'Runtime evaluation failed.');
      return evaluated.result?.value;
    }
  };
}

function summarize(values) {
  if (values.length === 0) return { count: 0, p50: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
  return { count: values.length, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1)) };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
