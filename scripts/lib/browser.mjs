// Shared headless-browser plumbing for the browser-driven scripts. The CDP
// session helpers (connectToTarget) stay in each script because each one
// collects different diagnostics.
import fs from 'node:fs/promises';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const BASE_BROWSER_FLAGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-background-networking',
  '--disable-sync',
  '--no-first-run',
  '--no-default-browser-check'
];

/** Keeps background pages running at full speed, for timing-sensitive runs. */
export const NO_BACKGROUND_THROTTLING_FLAGS = [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding'
];

/**
 * Launch a headless Chromium-family browser with remote debugging. The last
 * 4,000 characters of its stderr are kept on `browserStderr` for error reports,
 * and reading stderr keeps the pipe from filling and stalling the browser.
 */
export function launchHeadlessBrowser(executable, debugPort, userDataDir, extraFlags = []) {
  const child = spawn(executable, [
    ...BASE_BROWSER_FLAGS,
    ...extraFlags,
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
  child.stderr.setEncoding('utf8');
  child.browserStderr = '';
  child.stderr.on('data', chunk => {
    child.browserStderr = `${child.browserStderr}${chunk}`.slice(-4_000);
  });
  return child;
}

export async function detectBrowserExecutable() {
  const candidates = [
    process.env.CLEAR_WRITER_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge'
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Keep looking.
    }
  }
  throw new Error('No supported headless browser was found. Set CLEAR_WRITER_BROWSER or install Edge, Chrome, or Chromium.');
}

export async function createBrowserTarget(debugPort, url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT'
  });
  if (!response.ok) throw new Error(`Failed to create browser target (${response.status}).`);
  return response.json();
}

export async function waitForJson(url, attempts = 50) {
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
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  server.close();
  await once(server, 'close');
  if (!port) throw new Error('Failed to reserve a local port.');
  return port;
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function closeQuietly(session) {
  if (!session) return;
  await session.close().catch(() => undefined);
}
