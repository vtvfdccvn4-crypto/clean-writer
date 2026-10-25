import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { preview } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const port = await reservePort();
let server;

try {
  await assertFile('dist-web/manifest.webmanifest');
  await assertFile('dist-web/sw.js');
  const manifest = JSON.parse(await fs.readFile('dist-web/manifest.webmanifest', 'utf8'));
  assert(manifest.name === 'Clear Writer', 'Manifest name is incorrect.');
  assert(manifest.display === 'standalone', 'Manifest is not configured for standalone display.');

  server = await preview({
    root,
    configFile: path.join(root, 'vite.web.config.ts'),
    logLevel: 'error',
    preview: {
      host: '127.0.0.1',
      port,
      strictPort: true
    }
  });
  await waitForServer(port);

  const [indexResponse, manifestResponse, serviceWorkerResponse] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/index.html`),
    fetch(`http://127.0.0.1:${port}/manifest.webmanifest`),
    fetch(`http://127.0.0.1:${port}/sw.js`)
  ]);
  assert(indexResponse.ok, 'Production preview did not serve the application shell.');
  assert(manifestResponse.ok, 'Production preview did not serve the manifest.');
  assert(serviceWorkerResponse.ok, 'Production preview did not serve the service worker.');

  const index = await indexResponse.text();
  const serviceWorker = await serviceWorkerResponse.text();
  assert(index.includes('rel="manifest"'), 'Production shell does not link the manifest.');
  assert(index.includes('theme-color'), 'Production shell does not define a theme color.');
  assert(index.includes("frame-src 'self'"), 'Production shell blocks the same-origin PDF pagination frame.');
  assert(!index.includes('localhost:5274'), 'Development server URL leaked into production HTML.');
  assert(/CACHE_BUSTER\s*=/.test(serviceWorker) && !serviceWorker.includes('__CLEAR_WRITER_SW_BUILD_ID__'), 'Service worker build id was not written into the built worker.');
  assert(serviceWorker.includes('__CLEAR_WRITER_BUILD_ASSETS__') === false && /\["assets\//.test(serviceWorker), 'Service worker build asset list was not written into the built worker.');
  assert(serviceWorker.includes("'clear-writer-shell-'") && serviceWorker.includes('${SHELL_CACHE_PREFIX}${CACHE_BUSTER}'), 'Service worker cache naming is missing.');
  assert(serviceWorker.includes('self.addEventListener(\'fetch\''), 'Service worker fetch handler is missing.');

  console.log(JSON.stringify({ ok: true, manifest: true, serviceWorker: true, productionShell: true, port }, null, 2));
} finally {
  if (server) await server.close();
}

async function assertFile(path) {
  try { await fs.access(path); }
  catch { throw new Error(`Missing production artifact: ${path}`); }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function reservePort() {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function waitForServer(port) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the production preview server.');
}
