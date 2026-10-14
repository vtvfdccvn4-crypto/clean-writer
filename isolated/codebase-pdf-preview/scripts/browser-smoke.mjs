import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const pageUrl = process.env.CODEBASE_PDF_SMOKE_URL
  ?? 'http://127.0.0.1:5275/isolated/codebase-pdf-preview/examples/browser-smoke.html';
const executable = process.env.CODEBASE_PDF_BROWSER
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 9300 + Math.floor(Math.random() * 500);
const profile = await mkdtemp(path.join(os.tmpdir(), 'codebase-pdf-smoke-'));
let browser;

try {
  browser = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--disable-extensions',
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore' });
  const target = await waitForTarget(debugPort);
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: pageUrl });
    const result = await waitForResult(cdp);
    if (result.status !== 'success') throw new Error(result.text || 'Browser smoke test failed.');
    console.log(`PASS: ${result.pages} physical pages, render ${result.renderId.slice(0, 12)}.`);
    await cdp.send('Browser.close').catch(() => undefined);
  } finally {
    cdp.close();
  }
} finally {
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise(resolve => browser.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 2_000))
    ]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }).catch(() => undefined);
}

async function waitForTarget(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const target = targets.find(candidate => candidate.type === 'page');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {
      // Browser startup is asynchronous.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Headless browser did not expose the smoke-test page.');
}

async function waitForResult(cdp) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await cdp.send('Runtime.evaluate', {
      expression: `(() => { const el = document.querySelector('#status'); return { status: el?.dataset.result, pages: el?.dataset.pageCount, renderId: el?.dataset.renderId, text: el?.textContent }; })()`,
      returnByValue: true
    });
    const value = response.result?.result?.value ?? {};
    if (value.status === 'success' || value.status === 'failed') return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Browser smoke test did not settle.');
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let sequence = 0;
    socket.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const id = ++sequence;
        return new Promise((resolveRequest, rejectRequest) => {
          pending.set(id, { resolveRequest, rejectRequest });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      close: () => socket.close()
    }), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to the browser debugging endpoint.')), { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      message.error ? request.rejectRequest(new Error(message.error.message)) : request.resolveRequest(message);
    });
  });
}
