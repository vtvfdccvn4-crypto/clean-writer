import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 41789;
const debugPort = 41890;
const executable = process.env.CLEAR_WRITER_BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-runtime-'));
let server;
let browser;
try {
  server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true, hmr: false } });
  await server.listen();
  const response = await fetch(`http://127.0.0.1:${port}/`);
  if (!response.ok) throw new Error(`Vite returned HTTP ${response.status}`);
  console.log(`VITE_READY http=${response.status}`);
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const started = Date.now();
  let browserReady = false;
  while (Date.now() - started < 10_000) {
    try {
      const cdp = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (cdp.ok) {
        const details = await cdp.json();
        console.log(`BROWSER_READY ${details.Browser ?? details.UserAgent}`);
        browserReady = true;
        break;
      }
    } catch { /* browser is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!browserReady) throw new Error('Browser CDP endpoint did not become ready within 10 seconds.');
} finally {
  if (browser && !browser.killed) browser.kill();
  await server?.close();
  await fs.rm(profile, { recursive: true, force: true }).catch(() => undefined);
}
