import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { build } from 'vite';
import { createRequire } from 'node:module';
import { detectBrowserExecutable, reservePort } from './lib/browser.mjs';

// Playwright ships with the preinstalled browser image, not as a project dependency.
const { chromium } = createRequire(import.meta.url)('playwright');

// Offline first install, and an update with two tabs open, run against a real
// production build served from disk. The server reads the output on every request,
// so a file removed by the second build is really gone.

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist-web');
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

async function buildApp() {
  await build({ configFile: path.join(root, 'vite.web.config.ts'), logLevel: 'error' });
}

async function entryScript() {
  const html = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  const match = html.match(/src="(\.\/assets\/index-[^"]+\.js)"/);
  if (!match) throw new Error('The built index.html does not reference the entry script.');
  // Scope-relative, so './${path}' is the request the page makes.
  return match[1].slice(2);
}

const port = await reservePort();
const server = http.createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.join(outDir, pathname === '/' ? 'index.html' : pathname);
  try {
    const body = await fs.readFile(file);
    response.writeHead(200, { 'content-type': contentTypes[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${port}/`;

const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const browser = await chromium.launch({ executablePath: await detectBrowserExecutable(), args: ['--no-sandbox'] });
try {
  await buildApp();
  const firstEntry = await entryScript();

  const context = await browser.newContext();
  const tabOne = await context.newPage();
  const tabTwo = await context.newPage();
  const consoleErrors = [];
  for (const page of [tabOne, tabTwo]) page.on('pageerror', error => consoleErrors.push(error.message));

  // 1. First install: the worker precaches everything before the offline reload.
  await tabOne.goto(base);
  await tabOne.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 60_000 });
  await tabOne.waitForFunction(() => window.__CLEAR_WRITER_READY__ === true, null, { timeout: 60_000 });
  await context.setOffline(true);
  const reloadedOffline = await tabOne.reload({ waitUntil: 'domcontentloaded' }).then(() => true, () => false);
  expect(reloadedOffline, 'The page could not be reloaded offline after the first install.');
  if (reloadedOffline) await tabOne.waitForFunction(() => window.__CLEAR_WRITER_READY__ === true || Boolean(window.__CLEAR_WRITER_BOOT_ERROR__), null, { timeout: 60_000 });
  const offlineBoot = reloadedOffline ? await tabOne.evaluate(() => ({
    ready: window.__CLEAR_WRITER_READY__ === true,
    bootError: window.__CLEAR_WRITER_BOOT_ERROR__ ?? null,
    welcome: Boolean(document.getElementById('empty-canvas-new-project'))
  })) : { ready: false, bootError: 'offline reload failed', welcome: false };
  expect(offlineBoot.ready && !offlineBoot.bootError && offlineBoot.welcome, `Offline reload after first install did not boot: ${JSON.stringify(offlineBoot)}`);
  await context.setOffline(false);

  // Both tabs run build one and are controlled by its worker.
  await tabTwo.goto(base);
  await tabTwo.waitForFunction(() => window.__CLEAR_WRITER_READY__ === true, null, { timeout: 60_000 });
  await tabTwo.evaluate(() => { window.__keptOpen = true; });

  // 2. Build two replaces the files on disk; build one's entry script is gone.
  await buildApp();
  const secondEntry = await entryScript();
  expect(firstEntry !== secondEntry, 'The second build did not change the entry script, so the test cannot tell the builds apart.');
  await assertRemoved(path.join(outDir, firstEntry));

  // Both tabs find the update and offer it.
  for (const page of [tabOne, tabTwo]) {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null, null, { timeout: 60_000 });
    await page.waitForFunction(() => document.getElementById('confirm-modal-title')?.textContent === 'Update Available', null, { timeout: 30_000 });
  }

  // Before anyone accepts, build one's chunk still loads from the worker that controls the tab.
  const beforeAccept = await tabTwo.evaluate(async entry => (await fetch(`./${entry}`)).status, firstEntry);
  expect(beforeAccept === 200, `An open tab could not load its own entry chunk before the update was accepted (status ${beforeAccept}).`);

  // 3. Tab one accepts through the prompt. Only tab one reloads.
  // Accepting reloads the tab, so the click and the navigation are awaited together.
  await Promise.all([
    tabOne.waitForNavigation({ timeout: 60_000 }),
    tabOne.click('#btn-confirm-ok')
  ]);
  await tabOne.waitForFunction(() => window.__CLEAR_WRITER_READY__ === true, null, { timeout: 60_000 });
  const tabOneScripts = await tabOne.evaluate(() => [...document.querySelectorAll('script[type=module]')].map(script => script.getAttribute('src')));
  expect(tabOneScripts.some(src => src?.includes(secondEntry)), `Accepting tab did not load build two: ${JSON.stringify(tabOneScripts)}`);

  const tabTwoState = await tabTwo.evaluate(() => ({ kept: window.__keptOpen === true, ready: window.__CLEAR_WRITER_READY__ === true }));
  expect(tabTwoState.kept && tabTwoState.ready, 'The tab that did not accept the update was reloaded or lost its state.');

  // 4. The tab still running build one loads its chunk from the retained build.
  const afterAccept = await tabTwo.evaluate(async entry => (await fetch(`./${entry}`)).status, firstEntry);
  expect(afterAccept === 200, `The tab still running build one could not load its chunk after the update (status ${afterAccept}); the retained cache did not serve it.`);

  expect(consoleErrors.length === 0, `Page errors during the PWA flow: ${consoleErrors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length > 0) {
  throw new Error(`PWA smoke failed:\n- ${failures.join('\n- ')}`);
}
console.log(JSON.stringify({ ok: true, offlineFirstInstall: true, updateAcceptedInOneTabOnly: true, retainedChunkAfterUpdate: true }, null, 2));

async function assertRemoved(file) {
  await fs.access(file).then(
    () => { throw new Error(`The first build's file ${file} still exists, so the old tab would not depend on the cache.`); },
    () => undefined
  );
}
