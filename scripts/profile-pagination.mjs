import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const projectArgument = readArgument('--project');
const sampleCount = positiveInteger(readArgument('--samples'), 3);
const serverPort = await reservePort();
const browserDebugPort = await reservePort();
const fixturePath = '/test/fixtures/pagination-profile.html';

const browserExecutable = await detectBrowserExecutable();
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-writer-pagination-profile-'));
const viteServer = await createServer({
  root,
  appType: 'spa',
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: serverPort,
    strictPort: true,
    hmr: false
  }
});

let browserProcess;
let browserSession;

try {
  await viteServer.listen();

  const { compileMarkdown } = await viteServer.ssrLoadModule('/src/compiler/index.ts');
  const { buildFullDocumentMarkdown } = await viteServer.ssrLoadModule('/src/preview/document-rendering/index.ts');
  const scenarios = await buildScenarios(buildFullDocumentMarkdown, compileMarkdown);

  browserProcess = launchHeadlessBrowser(browserExecutable, browserDebugPort, userDataDir);
  const browserVersion = await waitForJson(`http://127.0.0.1:${browserDebugPort}/json/version`);
  const target = await createBrowserTarget(browserDebugPort, `http://127.0.0.1:${serverPort}${fixturePath}`);
  browserSession = await connectToTarget(target.webSocketDebuggerUrl);
  await waitForProfilerReady(browserSession);

  const results = await browserSession.evaluate(
    `window.__RUN_PAGINATION_PROFILE__(${JSON.stringify({ samples: sampleCount, scenarios })})`
  );

  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    runtime: process.version,
    browser: {
      executable: browserExecutable,
      userAgent: browserVersion.UserAgent
    },
    samples: sampleCount,
    scenarios: results
  }, null, 2)}\n`);
} finally {
  await closeQuietly(browserSession);
  if (browserProcess && !browserProcess.killed) {
    browserProcess.kill('SIGTERM');
    await once(browserProcess, 'exit').catch(() => undefined);
  }
  await viteServer.close();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

async function buildScenarios(buildFullDocumentMarkdown, compileMarkdown) {
  const scenarios = [
    await compileScenario('small', syntheticScenario(5, 12), buildFullDocumentMarkdown, compileMarkdown),
    await compileScenario('medium', syntheticScenario(15, 18), buildFullDocumentMarkdown, compileMarkdown),
    await compileScenario('large', syntheticScenario(40, 24), buildFullDocumentMarkdown, compileMarkdown)
  ];

  if (projectArgument) {
    const loaded = await loadProjectScenario(path.resolve(projectArgument));
    if (loaded) {
      scenarios.push(await compileScenario(loaded.name, loaded, buildFullDocumentMarkdown, compileMarkdown));
    }
  }

  return scenarios;
}

async function compileScenario(name, scenario, buildFullDocumentMarkdown, compileMarkdown) {
  const sections = scenario.blocks.map((block, index) => ({
    path: block.path,
    isDir: false,
    pageBreak: index > 0
  }));
  const markdown = buildFullDocumentMarkdown(sections, scenario.blocks);
  const html = await compileMarkdown(markdown);
  return { name, html };
}

function syntheticScenario(sectionCount, paragraphCount) {
  return {
    blocks: Array.from({ length: sectionCount }, (_, sectionIndex) => ({
      path: `Section ${String(sectionIndex + 1).padStart(3, '0')}.md`,
      pageBreak: sectionIndex > 0,
      markdown: syntheticMarkdown(sectionIndex + 1, paragraphCount)
    }))
  };
}

function syntheticMarkdown(sectionNumber, paragraphCount) {
  const paragraphs = Array.from({ length: paragraphCount }, (_, index) =>
    `Paragraph ${index + 1} describes validation, configuration tracking, tolerance review, and ` +
    `controlled authoring activity for section ${sectionNumber}. This text is intentionally long ` +
    `enough to produce stable pagination across warmed runs in the headless browser profiler.`
  );
  return [
    `# Profile section ${sectionNumber}`,
    '',
    ...paragraphs.flatMap(paragraph => [paragraph, '']),
    '## Verification notes',
    '',
    '- Confirm the rendered content remains deterministic.',
    '- Confirm the section still fits the pagination workload.',
    '',
    '| Parameter | Expected | Result |',
    '| --- | ---: | --- |',
    '| Latency | Low | Pass |',
    '| Stability | High | Pass |'
  ].join('\n');
}

async function loadProjectScenario(projectPath) {
  const sectionsRoot = path.join(projectPath, 'sections');
  try {
    const files = await markdownFiles(sectionsRoot);
    const blocks = await Promise.all(files.map(async filePath => ({
      path: path.relative(sectionsRoot, filePath).replaceAll('\\', '/'),
      pageBreak: true,
      markdown: await fs.readFile(filePath, 'utf8')
    })));
    return { name: `project:${path.basename(projectPath)}`, blocks };
  } catch (error) {
    process.stderr.write(`Skipping project profile: ${error instanceof Error ? error.message : String(error)}\n`);
    return null;
  }
}

async function markdownFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(candidate);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.md') ? [candidate] : [];
  }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

function launchHeadlessBrowser(executable, debugPort, userDataDir) {
  return spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
}

async function detectBrowserExecutable() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next browser.
    }
  }
  throw new Error('No supported headless browser was found. Install Microsoft Edge or Google Chrome.');
}

async function createBrowserTarget(debugPort, url) {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT'
  });
  if (!response.ok) {
    throw new Error(`Failed to create browser target (${response.status}).`);
  }
  return response.json();
}

async function waitForJson(url, attempts = 50) {
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

async function connectToTarget(webSocketUrl) {
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

  async function send(method, params = {}) {
    const id = ++nextId;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  await send('Page.enable');
  await send('Runtime.enable');

  return {
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
    }
  };
}

async function reservePort() {
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

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function closeQuietly(session) {
  if (!session) return;
  await session.close().catch(() => undefined);
}

async function waitForProfilerReady(browserSession) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const readiness = await browserSession.evaluate(`(() => ({
      ready: typeof window.__RUN_PAGINATION_PROFILE__ === 'function',
      state: document.readyState
    }))()`);
    if (readiness?.ready) return;
    await delay(100);
  }
  throw new Error('Pagination profiler fixture did not finish booting.');
}
